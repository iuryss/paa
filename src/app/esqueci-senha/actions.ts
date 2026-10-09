"use server";

import { after } from "next/server";
import type { ForgotState } from "@/components/account/forgot-password-form";
import { requestPasswordReset } from "@/lib/accounts/password-reset";
import { logger } from "@/lib/logger";
import { firstIssue, forgotPasswordSchema } from "@/lib/validation/accounts";

export async function requestPasswordResetAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { done: false, error: firstIssue(parsed.error) };

  // O link usa AUTH_URL (configuração), nunca o cabeçalho Host: evita envenenamento do link de redefinição.
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";

  // Roda depois da resposta: o tempo de resposta é igual exista ou não a conta.
  after(() =>
    requestPasswordReset(parsed.data.email, baseUrl).catch(() => logger.error("password_reset.failed")),
  );
  return { done: true, error: null };
}
