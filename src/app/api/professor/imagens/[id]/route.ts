import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { deleteImage } from "@/lib/images/service";
import { ADULT_ROLES } from "@/lib/rbac";
import { imageIdSchema } from "@/lib/validation/images";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = imageIdSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await deleteImage(access.user.id, id.data);
  if (result.ok) return NextResponse.json({ ok: true });
  if (result.code === "in_use") {
    return NextResponse.json({ error: "in_use", message: `Esta imagem está em ${result.uses} atividade(s).` }, { status: 409 });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
