import { NextResponse } from "next/server";
import { deleteActivity, updateActivity } from "@/lib/activities/service";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { idSchema, updateActivitySchema } from "@/lib/validation/activities";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
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

  const parsed = updateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", message: parsed.error.issues[0]?.message }, { status: 422 });
  }

  const result = await updateActivity(access.user.id, id.data, parsed.data);
  if (result.ok) return NextResponse.json({ ok: true });
  const status = { not_found: 404, locked: 409, invalid_content: 422 }[result.code];
  return NextResponse.json({ error: result.code }, { status });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await deleteActivity(access.user.id, id.data);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.code }, { status: result.code === "not_found" ? 404 : 409 });
}
