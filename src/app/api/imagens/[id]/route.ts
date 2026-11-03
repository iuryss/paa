import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { getImage } from "@/lib/images/service";
import { imageIdSchema } from "@/lib/validation/images";

/**
 * Entrega uma imagem para quem está logado (aluno ou adulto: as atividades usam as imagens).
 * Imagem nunca muda depois de enviada (novo envio = novo id), então o cache pode ser longo,
 * mas é "private": não fica guardada em proxies compartilhados.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(["TEACHER", "THERAPIST", "STUDENT"]);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  const id = imageIdSchema.safeParse((await params).id);
  const image = id.success ? await getImage(id.data) : null;
  if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
