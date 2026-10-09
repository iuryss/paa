"use server";

import { redirect } from "next/navigation";
import type { AcceptState } from "@/components/account/accept-invitation-form";
import { resetPassword } from "@/lib/accounts/password-reset";
import { firstIssue, setPasswordSchema } from "@/lib/validation/accounts";

const INVALID = "Este link não vale mais. Peça um novo em “Esqueci minha senha”.";

export async function resetPasswordAction(
  token: string,
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await resetPassword(token, parsed.data.password);
  if (!result.ok) return { error: INVALID };

  redirect("/entrar?senha=ok");
}
