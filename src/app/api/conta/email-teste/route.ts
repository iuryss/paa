import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { sendTestEmail } from "@/lib/email/test-email";
import { ADULT_ROLES } from "@/lib/rbac";

export async function POST() {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const result = await sendTestEmail(access.user.id);
  const noStore = { "Cache-Control": "no-store" };

  if (result.ok) {
    return NextResponse.json({ ok: true, to: result.maskedTo, provider: result.provider }, { headers: noStore });
  }
  if (result.code !== "send_failed") {
    return NextResponse.json(
      { ok: false, code: result.code },
      { status: result.code === "rate_limited" ? 429 : 403, headers: noStore },
    );
  }
  return NextResponse.json(
    { ok: false, code: result.failure.code, hint: result.failure.hint },
    { status: 502, headers: noStore },
  );
}
