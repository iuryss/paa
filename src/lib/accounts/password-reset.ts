import { prisma } from "@/lib/db";
import { passwordResetEmail } from "@/lib/email/templates";
import { describeEmailFailure } from "@/lib/email/diagnose";
import { sendEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import { hashSecret } from "@/lib/password";
import { createLimiter, defaultStore, loginLimiter } from "@/lib/rate-limit";
import { isAdultRole } from "@/lib/rbac";
import { generateToken, hashToken, TOKEN_REGEX } from "./tokens";

export const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_MINUTES = RESET_TTL_MS / 60_000;

/** Máx. 3 pedidos por e-mail por hora: impede usar o sistema para lotar a caixa de alguém. */
export const resetRequestLimiter = createLimiter(3, 60 * 60 * 1000, defaultStore, "reset");

/**
 * Pede o link de redefinição. NÃO informa se o e-mail existe: sem resposta diferente para quem chama.
 * (Quem chama deve rodar isso fora do caminho da resposta, p.ex. `after()`, para o tempo também não vazar.)
 * `baseUrl` vem da configuração (AUTH_URL), nunca do cabeçalho Host da requisição (ataque de host header).
 */
export async function requestPasswordReset(
  email: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<void> {
  const key = `reset:${email}`;
  if (await resetRequestLimiter.isBlocked(key)) {
    logger.warn("password_reset.rate_limited");
    return;
  }
  await resetRequestLimiter.fail(key); // cada pedido conta

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, displayName: true, role: true, active: true },
  });
  if (!user || !user.active || !isAdultRole(user.role)) return;

  const { token, hash } = generateToken();
  await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordReset.create({
    data: { tokenHash: hash, userId: user.id, expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "auth.password.reset.request" } });

  try {
    await sendEmail(
      passwordResetEmail({
        to: email,
        name: user.displayName,
        link: `${baseUrl.replace(/\/$/, "")}/redefinir-senha/${token}`,
        minutes: RESET_MINUTES,
      }),
    );
  } catch (error) {
    const { code, status } = describeEmailFailure(error);
    logger.error("password_reset.email_failed", { code, status });
  }
}

/** A página de redefinição só aparece para links ainda válidos. */
export async function isResetTokenValid(token: string, now: Date = new Date()): Promise<boolean> {
  if (!TOKEN_REGEX.test(token)) return false;
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true },
  });
  return row !== null && row.usedAt === null && row.expiresAt > now;
}

export type ResetPasswordResult = { ok: true } | { ok: false; code: "invalid" };

/** Define a nova senha. O link é consumido na mesma transação que troca a senha. */
export async function resetPassword(
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<ResetPasswordResult> {
  if (!TOKEN_REGEX.test(token)) return { ok: false, code: "invalid" };
  const passwordHash = await hashSecret(newPassword); // custoso: fora da transação

  const result = await prisma.$transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= now) return null;

    const claimed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return null;

    const user = await tx.user.findUnique({
      where: { id: reset.userId },
      select: { email: true, role: true, active: true },
    });
    if (!user || !user.active || !isAdultRole(user.role)) return null;

    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.passwordReset.deleteMany({ where: { userId: reset.userId, usedAt: null } });
    await tx.auditLog.create({ data: { actorId: reset.userId, action: "auth.password.reset" } });
    return user.email ?? "";
  });

  if (result === null) return { ok: false, code: "invalid" };
  // Quem esqueceu a senha pode estar bloqueado por tentativas: libera o login.
  if (result) await loginLimiter.reset(`adult:${result}`);
  return { ok: true };
}
