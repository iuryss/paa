import { z } from "zod";

export const THEMES = ["calmo", "foco", "contraste"] as const;
export const CONTENT_MODES = ["textual", "pictografico"] as const;
export const FONTS = ["sans", "leitura"] as const;

export const preferencesSchema = z
  .object({
    theme: z.enum(THEMES),
    contentMode: z.enum(CONTENT_MODES),
    font: z.enum(FONTS),
    reducedMotion: z.boolean(),
    soundEnabled: z.boolean(),
  })
  .strict();

export type Preferences = z.infer<typeof preferencesSchema>;
