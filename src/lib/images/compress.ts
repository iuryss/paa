import { IMAGE_MIMES, MAX_IMAGE_BYTES, type ImageProblem } from "@/lib/images/format";

/** Lado maior depois de reduzir: nítido no tablet, leve no banco. */
export const TARGET_SIDE = 1200;

export class ImagePrepareError extends Error {
  constructor(public readonly problem: ImageProblem) {
    super(problem);
    this.name = "ImagePrepareError";
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Só no navegador: reduz e regrava a imagem em WebP (ou JPEG, se o navegador não gravar WebP),
 * baixando a qualidade e depois o tamanho até caber em MAX_IMAGE_BYTES. Regravar no canvas
 * também descarta os metadados (EXIF/GPS) ainda no computador do professor.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (!(IMAGE_MIMES as readonly string[]).includes(file.type)) throw new ImagePrepareError("formato");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new ImagePrepareError("formato");
  });

  let scale = Math.min(1, TARGET_SIDE / Math.max(bitmap.width, bitmap.height));
  for (let round = 0; round < 4; round++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImagePrepareError("formato");
    ctx.fillStyle = "#ffffff"; // transparência vira branco se cair no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.75, 0.65, 0.55]) {
      let blob = await encode(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
      if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    scale *= 0.75;
  }
  throw new ImagePrepareError("tamanho");
}
