import { NextResponse } from "next/server";
import { duplicateActivity } from "@/lib/activities/service";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { idSchema } from "@/lib/validation/activities";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await duplicateActivity(access.user.id, id.data);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: 404 });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
