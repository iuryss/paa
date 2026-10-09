import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getDummyHash, verifySecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { isAdultRole } from "@/lib/rbac";
import { adultLoginSchema, studentLoginSchema } from "@/lib/validation/auth";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: Role;
}

async function audit(actorId: string, action: string): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorId, action } });
  } catch {
    logger.warn("audit.write_failed", { action });
  }
}

/** Login de professor/terapeuta (e-mail + senha). Retorna null em qualquer falha (resposta neutra). */
export async function authenticateAdult(raw: unknown): Promise<AuthenticatedUser | null> {
  const parsed = adultLoginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const key = `adult:${email}`;
  if (loginLimiter.isBlocked(key)) {
    logger.warn("auth.blocked", { scope: "adult" });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Sempre compara hash (mesmo sem usuário) para não vazar existência pelo tempo de resposta.
  const valid = await verifySecret(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !valid || !user.active || !isAdultRole(user.role)) {
    loginLimiter.fail(key);
    logger.info("auth.failed", { scope: "adult" });
    return null;
  }

  loginLimiter.reset(key);
  await audit(user.id, "auth.login");
  return { id: user.id, name: user.displayName, role: user.role };
}

/** Login do aluno (código opaco + PIN de 4 dígitos). Bloqueio por código contra força bruta do PIN. */
export async function authenticateStudent(raw: unknown): Promise<AuthenticatedUser | null> {
  const parsed = studentLoginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { studentCode, pin } = parsed.data;

  const key = `student:${studentCode}`;
  if (loginLimiter.isBlocked(key)) {
    logger.warn("auth.blocked", { scope: "student" });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { studentCode } });
  const valid = await verifySecret(pin, user?.pinHash ?? (await getDummyHash()));

  if (!user || !valid || !user.active || user.role !== "STUDENT") {
    loginLimiter.fail(key);
    logger.info("auth.failed", { scope: "student" });
    return null;
  }

  loginLimiter.reset(key);
  await audit(user.id, "auth.login");
  return { id: user.id, name: user.displayName, role: user.role };
}
