import { NextResponse } from "next/server";
import { createInvitation, emailInvitation } from "@/lib/accounts/invitations";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { firstIssue, inviteSchema } from "@/lib/validation/accounts";

export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: firstIssue(parsed.error) }, { status: 422 });
  }

  const result = await createInvitation(access.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: 409 });

  // AUTH_URL = endereço público (atrás de proxy o origin da requisição seria o interno).
  const origin = (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
  const link = `${origin}/convite/${result.token}`;
  const emailSent = await emailInvitation({
    inviterId: access.user.id,
    to: parsed.data.email,
    name: parsed.data.displayName,
    link,
  });

  return NextResponse.json(
    { link, expiresAt: result.expiresAt, emailSent },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
