import type { ContentMode, FontFamily, SensoryTheme } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Preferences } from "@/lib/validation/preferences";

export type { Preferences };

/** Baixo Estímulo, textual, sem movimento nem som: o padrão seguro do design system. */
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "calmo",
  contentMode: "textual",
  font: "sans",
  reducedMotion: true,
  soundEnabled: false,
};

const THEME_TO_DB: Record<Preferences["theme"], SensoryTheme> = {
  calmo: "CALMO",
  foco: "FOCO",
  contraste: "CONTRASTE",
};
const MODE_TO_DB: Record<Preferences["contentMode"], ContentMode> = {
  textual: "TEXTUAL",
  pictografico: "PICTOGRAFICO",
};
const FONT_TO_DB: Record<Preferences["font"], FontFamily> = {
  sans: "SANS",
  leitura: "LEITURA",
};

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;
}

const THEME_FROM_DB = invert(THEME_TO_DB);
const MODE_FROM_DB = invert(MODE_TO_DB);
const FONT_FROM_DB = invert(FONT_TO_DB);

/** Lê o perfil sensorial; qualquer falha cai no padrão seguro (a tela nunca quebra por isso). */
export async function loadPreferences(userId: string): Promise<Preferences> {
  try {
    const row = await prisma.sensoryProfile.findUnique({ where: { userId } });
    if (!row) return DEFAULT_PREFERENCES;
    return {
      theme: THEME_FROM_DB[row.theme],
      contentMode: MODE_FROM_DB[row.contentMode],
      font: FONT_FROM_DB[row.fontFamily],
      reducedMotion: row.reducedMotion,
      soundEnabled: row.soundEnabled,
    };
  } catch {
    logger.warn("preferences.load_failed");
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(userId: string, prefs: Preferences): Promise<void> {
  const data = {
    theme: THEME_TO_DB[prefs.theme],
    contentMode: MODE_TO_DB[prefs.contentMode],
    fontFamily: FONT_TO_DB[prefs.font],
    reducedMotion: prefs.reducedMotion,
    soundEnabled: prefs.soundEnabled,
  };
  await prisma.sensoryProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}
