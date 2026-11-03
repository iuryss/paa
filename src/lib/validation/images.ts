import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

/** Ids de imagem são cuid (letras minúsculas e números). */
export const imageIdSchema = z.string().regex(/^c[a-z0-9]{20,30}$/);

/** Texto alternativo: o que a imagem mostra, para o leitor de tela. */
export const imageAltSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(3, "Descreva a imagem em poucas palavras.").max(120, "Use até 120 letras."));

/** Campos do envio (além do arquivo). O professor PRECISA confirmar que não é foto de aluno. */
export const imageUploadSchema = z
  .object({
    alt: imageAltSchema,
    confirmo: z.literal("sim", { errorMap: () => ({ message: "Confirme que a imagem não mostra alunos." }) }),
  })
  .strict();
