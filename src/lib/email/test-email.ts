import { prisma } from "@/lib/db";
import { describeEmailFailure, type EmailFailure } from "@/lib/email/diagnose";
import { readEmailConfig, type EmailProviderName } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { testEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { createLimiter, defaultStore } from "@/lib/rate-limit";
import { isAdultRole } from "@/lib/rbac";

/** 3 envios de teste por hora por pessoa: o botão não pode virar um disparador de e-mails. */
export const testEmailLimiter = createLimiter(3, 60 * 60 * 1000, defaultStore, "email-test");

export type TestEmailResult =
  | { ok: true; maskedTo: string; provider: EmailProviderName }
  | { ok: false; code: "rate_limited" | "forbidden" }
  | { ok: false; code: "send_failed"; failure: EmailFailure };

/** "ana.souza@escola.com" → "a***@escola.com" */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

/**
 * Envia um e-mail de teste PARA O PRÓPRIO usuário logado (nunca para um endereço informado),
 * para validar a configuração do provedor sem precisar do fluxo de "esqueci a senha".
 */
export async function sendTestEmail(userId: string): Promise<TestEmailResult> {
  if (await testEmailLimiter.isBlocked(userId)) return { ok: false, code: "rate_limited" };
  await testEmailLimiter.fail(userId); // cada tentativa conta

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true, role: true, active: true },
  });
  if (!user?.email || !user.active || !isAdultRole(user.role)) return { ok: false, code: "forbidden" };

  try {
    const { EMAIL_PROVIDER: provider } = readEmailConfig();
    await sendEmail(testEmail({ to: user.email, name: user.displayName }));
    await prisma.auditLog.create({ data: { actorId: userId, action: "email.test" } });
    return { ok: true, maskedTo: maskEmail(user.email), provider };
  } catch (error) {
    const failure = describeEmailFailure(error);
    logger.warn("email_test.failed", { code: failure.code, status: failure.status });
    return { ok: false, code: "send_failed", failure };
  }
}
