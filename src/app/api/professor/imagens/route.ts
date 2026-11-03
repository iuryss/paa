import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { IMAGE_PROBLEM_TEXT, MAX_IMAGE_BYTES } from "@/lib/images/format";
import { listImages, saveImage, uploadLimiter } from "@/lib/images/service";
import { ADULT_ROLES } from "@/lib/rbac";
import { imageUploadSchema } from "@/lib/validation/images";

/** As imagens do próprio professor (para escolher no editor). */
export async function GET() {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });
  return NextResponse.json({ images: await listImages(access.user.id) });
}

/** Envio: multipart com `arquivo`, `alt` e `confirmo=sim`. A imagem já chega comprimida pelo navegador. */
export async function POST(req: Request) {
  const access = await guard(ADULT_ROLES);
  if (!access.ok) return NextResponse.json({ error: access.code }, { status: access.status });

  if (await uploadLimiter.isBlocked(access.user.id)) {
    return NextResponse.json({ error: "rate_limited", message: "Muitos envios seguidos. Tente daqui a pouco." }, { status: 429 });
  }
  // Recusa cedo o que obviamente não cabe (o limite real é conferido nos bytes, abaixo).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 16 * 1024) {
    return NextResponse.json({ error: "too_large", message: IMAGE_PROBLEM_TEXT.tamanho }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const file = form.get("arquivo");
  const fields = imageUploadSchema.safeParse({ alt: form.get("alt"), confirmo: form.get("confirmo") });
  if (!(file instanceof Blob) || !fields.success) {
    const message = fields.success ? "Escolha um arquivo de imagem." : fields.error.issues[0]?.message;
    return NextResponse.json({ error: "invalid_input", message }, { status: 422 });
  }

  const result = await saveImage(access.user.id, new Uint8Array(await file.arrayBuffer()), fields.data.alt);
  if (!result.ok) {
    const message =
      result.code === "quota" ? "Você chegou ao limite de imagens. Apague alguma que não usa mais." : IMAGE_PROBLEM_TEXT[result.problem];
    return NextResponse.json({ error: result.code, message }, { status: result.code === "quota" ? 409 : 422 });
  }
  await uploadLimiter.fail(access.user.id); // conta o envio para o limite por hora
  return NextResponse.json(result.image, { status: 201 });
}
