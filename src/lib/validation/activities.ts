import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

export const SUPPORTED_MODULES = ["LOCALIZACAO", "GRAFIA", "MATEMATICA"] as const;
export type SupportedModule = (typeof SUPPORTED_MODULES)[number];

export const DIRECTIONS = ["norte", "sul", "leste", "oeste"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Pictogramas permitidos (mapeados para ícones no cliente). Lista fechada: nada de URL externa. */
export const ICON_NAMES = [
  "norte",
  "sul",
  "leste",
  "oeste",
  "casa",
  "escola",
  "arvore",
  "maca",
  "estrela",
  "circulo",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

// ───────────── Formato normalizado que o cliente joga (serializável) ─────────────

export type Stimulus =
  | { kind: "map"; piece: { label: string; icon?: IconName }; position: Direction }
  | { kind: "letter"; display: string }
  | { kind: "count"; a: number; b: number };

export interface PlayOption {
  id: string;
  label: string;
  icon?: IconName;
}

export interface PlayItem {
  key: string;
  prompt: string;
  hint?: string;
  options: PlayOption[];
  correctId: string;
  stimulus: Stimulus;
}

// ───────────── Schemas de conteúdo (validação + sanitização) ─────────────

const text = (max: number) => z.string().transform(sanitizeText).pipe(z.string().min(1).max(max));
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const icon = z.enum(ICON_NAMES);

function itemShape<Id extends z.ZodType<string>>(id: Id) {
  return {
    key: slug,
    prompt: text(120),
    hint: text(120).optional(),
    options: z
      .array(z.object({ id, label: text(40), icon: icon.optional() }).strict())
      .min(2)
      .max(4),
    correctId: id,
  };
}

const localizacaoItem = z
  .object({
    ...itemShape(z.enum(DIRECTIONS)),
    piece: z.object({ label: text(30), icon: icon.optional() }).strict(),
    position: z.enum(DIRECTIONS),
  })
  .strict()
  .refine((i) => i.correctId === i.position, {
    message: "A resposta correta precisa ser a posição da peça no mapa.",
    path: ["correctId"],
  });

const grafiaItem = z.object({ ...itemShape(slug), display: text(3) }).strict();

const matematicaItem = z
  .object({
    ...itemShape(slug),
    a: z.number().int().min(0).max(10),
    b: z.number().int().min(0).max(10),
  })
  .strict();

interface ItemLike {
  key: string;
  correctId: string;
  options: { id: string }[];
}

function checkItems({ items }: { items: ItemLike[] }, ctx: z.RefinementCtx): void {
  const keys = new Set<string>();
  items.forEach((item, i) => {
    if (keys.has(item.key)) {
      ctx.addIssue({ code: "custom", path: ["items", i, "key"], message: "Chave repetida." });
    }
    keys.add(item.key);
    const ids = item.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["items", i, "options"], message: "Opções repetidas." });
    }
    if (!ids.includes(item.correctId)) {
      ctx.addIssue({
        code: "custom",
        path: ["items", i, "correctId"],
        message: "A resposta correta precisa estar entre as opções.",
      });
    }
  });
}

const content = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({ items: z.array(item).min(1).max(20) })
    .strict()
    .superRefine((val, ctx) => checkItems(val as unknown as { items: ItemLike[] }, ctx));

export const contentSchemas = {
  LOCALIZACAO: content(localizacaoItem),
  GRAFIA: content(grafiaItem),
  MATEMATICA: content(matematicaItem),
} as const;

export function isSupportedModule(value: string): value is SupportedModule {
  return (SUPPORTED_MODULES as readonly string[]).includes(value);
}

type RawItem = Record<string, unknown> & {
  key: string;
  prompt: string;
  hint?: string;
  options: PlayOption[];
  correctId: string;
};

function stimulusFor(module: SupportedModule, item: RawItem): Stimulus {
  if (module === "LOCALIZACAO") {
    const { piece, position } = item as unknown as {
      piece: { label: string; icon?: IconName };
      position: Direction;
    };
    return { kind: "map", piece, position };
  }
  if (module === "GRAFIA") {
    return { kind: "letter", display: (item as unknown as { display: string }).display };
  }
  const { a, b } = item as unknown as { a: number; b: number };
  return { kind: "count", a, b };
}

export type ParsedContent =
  | { success: true; content: unknown; items: PlayItem[] }
  | { success: false };

/** Valida o JSON do banco/da API e devolve o conteúdo já sanitizado + os itens normalizados. */
export function parseActivityContent(module: string, raw: unknown): ParsedContent {
  if (!isSupportedModule(module)) return { success: false };
  const result = contentSchemas[module].safeParse(raw);
  if (!result.success) return { success: false };

  const data = result.data as { items: RawItem[] };
  const items: PlayItem[] = data.items.map((item) => ({
    key: item.key,
    prompt: item.prompt,
    ...(item.hint ? { hint: item.hint } : {}),
    options: item.options.map((o) => ({
      id: o.id,
      label: o.label,
      ...(o.icon ? { icon: o.icon } : {}),
    })),
    correctId: item.correctId,
    stimulus: stimulusFor(module, item),
  }));
  return { success: true, content: result.data, items };
}

// ───────────── Entradas das APIs do professor ─────────────

export const createActivitySchema = z
  .object({
    module: z.enum(SUPPORTED_MODULES),
    difficulty: z.enum(["INICIAL", "INTERMEDIARIO", "AVANCADO"]).default("INICIAL"),
    title: text(80),
    instruction: text(120),
    content: z.unknown(),
    published: z.boolean().default(false),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!parseActivityContent(val.module, val.content).success) {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: "Conteúdo inválido para este módulo.",
      });
    }
  });

/** Edição parcial. O módulo não muda (as respostas gravadas dependem dele). */
export const updateActivitySchema = z
  .object({
    title: text(80).optional(),
    instruction: text(120).optional(),
    difficulty: z.enum(["INICIAL", "INTERMEDIARIO", "AVANCADO"]).optional(),
    published: z.boolean().optional(),
    content: z.unknown().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nada para atualizar.");

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{6,40}$/);

export const assignActivitySchema = z
  .object({ activityId: idSchema, studentId: idSchema })
  .strict();

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type AssignActivityInput = z.infer<typeof assignActivitySchema>;
