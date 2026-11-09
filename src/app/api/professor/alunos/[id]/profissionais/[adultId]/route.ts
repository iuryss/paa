import { NextResponse } from "next/server";
import { removeAdultFromStudent } from "@/lib/accounts/student-team";
import { guard } from "@/lib/auth/guard";
import { ADULT_ROLES } from "@/lib/rbac";
import { idSchema } from "@/lib/validation/activities";

/** Tira um adulto do acompanhamento. Quando `adultId` é a própria pessoa, é sair do acompanhamento. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; adultId: string }> }) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const { id, adultId } = await params;
  const student = idSchema.safeParse(id);
  const adult = idSchema.safeParse(adultId);
  if (!student.success || !adult.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await removeAdultFromStudent(access.user.id, student.data, adult.data);
  if (result.ok) return NextResponse.json({ ok: true });
  if (result.code === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    { error: "last_adult", message: "Este aluno precisa de pelo menos um profissional." },
    { status: 409 },
  );
}
