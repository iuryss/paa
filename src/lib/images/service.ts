import { prisma } from "@/lib/db";
import { parseImage, type ImageProblem } from "@/lib/images/format";
import { createLimiter, defaultStore } from "@/lib/rate-limit";

/** ~30 MB por adulto, cabe com folga no plano gratuito do banco (e evita abuso). */
export const MAX_IMAGES_PER_ADULT = 100;
/** No máximo 30 envios por hora por adulto. */
export const uploadLimiter = createLimiter(30, 60 * 60 * 1000, defaultStore, "image-upload");

export interface ImageSummary {
  id: string;
  alt: string;
  width: number;
  height: number;
}

export type SaveImageResult =
  | { ok: true; image: ImageSummary }
  | { ok: false; code: "invalid"; problem: ImageProblem }
  | { ok: false; code: "quota" };

const summary = { id: true, alt: true, width: true, height: true } as const;

/** Guarda a imagem JÁ limpa (sem EXIF/GPS) e registra na auditoria, sem o conteúdo. */
export async function saveImage(ownerId: string, bytes: Uint8Array, alt: string): Promise<SaveImageResult> {
  const parsed = parseImage(bytes);
  if (!parsed.ok) return { ok: false, code: "invalid", problem: parsed.problem };
  if ((await prisma.image.count({ where: { ownerId } })) >= MAX_IMAGES_PER_ADULT) return { ok: false, code: "quota" };

  const image = await prisma.image.create({
    data: {
      ownerId,
      mime: parsed.mime,
      width: parsed.width,
      height: parsed.height,
      size: parsed.data.length,
      data: Buffer.from(parsed.data),
      alt,
    },
    select: summary,
  });
  await prisma.auditLog.create({ data: { actorId: ownerId, action: "image.upload", targetId: image.id } });
  return { ok: true, image };
}

export function listImages(ownerId: string): Promise<ImageSummary[]> {
  return prisma.image.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, select: summary });
}

export function getImage(id: string) {
  return prisma.image.findUnique({ where: { id }, select: { mime: true, data: true, size: true } });
}

/** Quantas atividades usam a imagem (procura o id no conteúdo; ids cuid não colidem com texto comum). */
async function usage(id: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "Activity" WHERE "content"::text LIKE ${`%${id}%`}`;
  return Number(rows[0]?.n ?? 0);
}

export type DeleteImageResult = { ok: true } | { ok: false; code: "not_found" | "in_use"; uses?: number };

/** Só a dona apaga, e só se nenhuma atividade usa (senão a figura sumiria da tela das crianças). */
export async function deleteImage(ownerId: string, id: string): Promise<DeleteImageResult> {
  const image = await prisma.image.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!image) return { ok: false, code: "not_found" };
  const uses = await usage(id);
  if (uses > 0) return { ok: false, code: "in_use", uses };
  await prisma.image.delete({ where: { id } });
  await prisma.auditLog.create({ data: { actorId: ownerId, action: "image.delete", targetId: id } });
  return { ok: true };
}

/** Campos que guardam imagem no conteúdo (`image` na leitura e nas respostas, `supportImage` no exercício). */
const IMAGE_KEY = /^(image|supportImage)$/;

/** Todos os ids de imagem citados num conteúdo de atividade. */
export function collectImageIds(content: unknown): string[] {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (IMAGE_KEY.test(key) && child && typeof child === "object" && typeof (child as { id?: unknown }).id === "string") {
        ids.add((child as { id: string }).id);
      } else {
        walk(child);
      }
    }
  };
  walk(content);
  return [...ids];
}

/** Ids citados que não existem (imagem apagada, ou id inventado): a atividade não pode ser salva assim. */
export async function findMissingImages(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await prisma.image.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const existing = new Set(found.map((f) => f.id));
  return ids.filter((id) => !existing.has(id));
}
