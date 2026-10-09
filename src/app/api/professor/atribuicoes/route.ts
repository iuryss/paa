import { NextResponse } from "next/server";
import { assignActivity } from "@/lib/activities/service";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { assignActivitySchema } from "@/lib/validation/activities";

export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = assignActivitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 422 });

  const result = await assignActivity(access.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: result.code === "forbidden" ? 403 : 404 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
