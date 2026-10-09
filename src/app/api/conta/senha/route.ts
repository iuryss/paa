import { NextResponse } from "next/server";
import { changePassword } from "@/lib/accounts/change-password";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { changePasswordSchema, firstIssue } from "@/lib/validation/accounts";

const STATUS = { wrong_current: 400, rate_limited: 429, forbidden: 403 } as const;

export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: firstIssue(parsed.error) }, { status: 422 });
  }

  const result = await changePassword(access.user.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: STATUS[result.code] });
  return NextResponse.json({ ok: true });
}
