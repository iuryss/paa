import { NextResponse } from "next/server";
import { createActivity } from "@/lib/activities/service";
import { guard } from "@/lib/auth/guard";
import { collectImageIds, findMissingImages } from "@/lib/images/service";
import { ADULT_ROLES } from "@/lib/rbac";
import { createActivitySchema } from "@/lib/validation/activities";

export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 },
    );
  }

  const missing = await findMissingImages(collectImageIds(parsed.data.content));
  if (missing.length > 0) {
    return NextResponse.json({ error: "missing_images", message: "Uma imagem desta atividade não existe mais." }, { status: 422 });
  }

  const activity = await createActivity(access.user.id, parsed.data);
  return NextResponse.json(activity, { status: 201 });
}
