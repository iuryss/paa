"use server";

import { redirect } from "next/navigation";
import type { AcceptState } from "@/components/account/accept-invitation-form";
import { acceptInvitation } from "@/lib/accounts/invitations";
import { pickFields } from "@/lib/form-data";
import { acceptInvitationSchema, firstIssue } from "@/lib/validation/accounts";

const INVALID = "Este convite não vale mais. Peça um novo a quem convidou você.";

export async function acceptInvitationAction(
  token: string,
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const parsed = acceptInvitationSchema.safeParse(pickFields(formData, ["password", "confirm"]));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await acceptInvitation(token, parsed.data.password);
  if (!result.ok) return { error: INVALID };

  redirect("/entrar?cadastro=ok");
}
