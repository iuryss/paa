"use server";

import { guard } from "@/lib/auth/guard";
import { savePreferences } from "@/lib/preferences";
import { preferencesSchema } from "@/lib/validation/preferences";

export async function savePreferencesAction(input: unknown): Promise<{ ok: boolean }> {
  const access = await guard(["TEACHER", "THERAPIST", "STUDENT"]);
  if (!access.ok) return { ok: false };

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  await savePreferences(access.user.id, parsed.data);
  return { ok: true };
}
