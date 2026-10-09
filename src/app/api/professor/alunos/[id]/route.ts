import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteStudent } from "@/lib/accounts/student-lifecycle";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { idSchema } from "@/lib/validation/activities";

const bodySchema = z.object({ confirm: z.string().min(1).max(60) }).strict();

/** Exclusão definitiva. Exige o apelido do aluno no corpo (confirmação digitada). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 422 });

  const result = await deleteStudent(access.user.id, id.data, parsed.data.confirm);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.code }, { status: result.code === "not_found" ? 404 : 422 });
}
