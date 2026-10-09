import { z } from "zod";

export const HELP_LEVELS = ["NONE", "VERBAL_HINT", "VISUAL_HINT", "FULL_MODEL"] as const;

/** `correct` NÃO vem do cliente: o servidor calcula comparando a opção com o conteúdo da atividade. */
export const attemptInputSchema = z
  .object({
    itemKey: z.string().regex(/^[a-z0-9-]{1,40}$/),
    optionId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    helpLevel: z.enum(HELP_LEVELS),
    elapsedMs: z.number().int().min(0).max(60 * 60 * 1000),
    attemptNo: z.number().int().min(1).max(50),
  })
  .strict();

export type AttemptInput = z.infer<typeof attemptInputSchema>;
