import { NextResponse } from "next/server";
import { saveStudentProfile } from "@/lib/accounts/student-profile";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { idSchema } from "@/lib/validation/activities";
import { preferencesSchema } from "@/lib/validation/preferences";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 422 });

  const result = await saveStudentProfile(access.user.id, id.data, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: 404 });
  return NextResponse.json({ ok: true });
}
