import { z } from "zod";
import { DEFAULT_MARKER_STYLE, MARKER_STYLES } from "@/lib/activities/markers";
import { LETTER_CASES, MAX_EXTRA_LETTERS, type NameConfig } from "@/lib/activities/name";
import { sanitizeText } from "@/lib/sanitize";

/** LIVRE (perguntas livres) virou FOLHA: a migração 20261028120100 converte as atividades antigas. */
export const SUPPORTED_MODULES = ["LOCALIZACAO", "GRAFIA", "MATEMATICA", "FOLHA", "NOME"] as const;
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
  // Usados principalmente nas perguntas livres (natureza, bichos, comida, rotina, emoções).
  "sol",
  "lua",
  "nuvem",
  "chuva",
  "agua",
  "flor",
  "cachorro",
  "gato",
  "peixe",
  "passaro",
  "banana",
  "cenoura",
  "leite",
  "comida",
  "carro",
  "onibus",
  "livro",
  "roupa",
  "cama",
  "banho",
  "mao",
  "musica",
  "coracao",
  "feliz",
  "triste",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

// ───────────── Formato normalizado que o cliente joga (serializável) ─────────────

export type Stimulus =
  | { kind: "map"; piece: { label: string; icon?: IconName }; position: Direction }
  | { kind: "letter"; display: string }
  | { kind: "count"; a: number; b: number }
  /** Pergunta livre: apoio opcional (texto curto e/ou pictograma) escrito pelo professor. */
  | { kind: "free"; text?: string; icon?: IconName };

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
  /** Marcar todas: TODAS as certas (correctId é a primeira delas). */
  correctIds?: string[];
  /** Ordem fixa, sem embaralhar (ex.: Verdadeiro/Falso). */
  fixedOrder?: boolean;
  /** Folha: em qual exercício a criança está (e em qual frase, no V/F). */
  exercise?: { index: number; total: number; part?: { index: number; total: number } };
  stimulus: Stimulus;
}

/** A regra de "certo" de um passo, a mesma no navegador e no servidor. */
export function isCorrectOption(item: PlayItem, optionId: string): boolean {
  return item.correctIds ? item.correctIds.includes(optionId) : optionId === item.correctId;
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

/** Até 300 caracteres de apoio: ~6 linhas de 45 caracteres, o limite de leitura do design system. */
export const MAX_SUPPORT_TEXT = 300;

// ───────────── Folha (atividade adaptada): apoio + exercícios de tipos diferentes ─────────────

/** O texto da folha é maior que o apoio de um exercício: é a "leitura" da página do caderno. */
export const MAX_SHEET_TEXT = 800;
export const MAX_EXAMPLE_TEXT = 300;
export const MAX_SHEET_EXERCISES = 12;
export const MAX_STATEMENTS = 6;
export const EXERCISE_TYPES = ["escolha", "marcar", "vf"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Bloco de apoio no topo da folha. `**palavra**` no texto vira destaque. */
export interface SheetSupport {
  text?: string;
  icon?: IconName;
  example?: string;
}

const sheetOption = z.object({ id: slug, label: text(40), icon: icon.optional() }).strict();
const exerciseBase = {
  key: slug,
  prompt: text(120),
  hint: text(120).optional(),
  support: text(MAX_SUPPORT_TEXT).optional(),
  supportIcon: icon.optional(),
};

const sheetExercise = z.discriminatedUnion("type", [
  z.object({ type: z.literal("escolha"), ...exerciseBase, options: z.array(sheetOption).min(2).max(4), correctId: slug }).strict(),
  /** Marcar todas as certas (no papel: "pinte as respostas certas"). */
  z
    .object({
      type: z.literal("marcar"),
      ...exerciseBase,
      options: z.array(sheetOption).min(2).max(4),
      correctIds: z.array(slug).min(1).max(4),
    })
    .strict(),
  /** Verdadeiro ou falso: uma frase por vez. */
  z
    .object({
      type: z.literal("vf"),
      ...exerciseBase,
      statements: z
        .array(z.object({ id: slug, text: text(200), correct: z.boolean() }).strict())
        .min(1)
        .max(MAX_STATEMENTS),
    })
    .strict(),
]);
type SheetExercise = z.infer<typeof sheetExercise>;

/** Chave de telemetria de cada frase do V/F: "item-2-s1". */
export const statementKey = (exerciseKey: string, statementId: string) => `${exerciseKey}-${statementId}`;

function checkSheet({ items }: { items: SheetExercise[] }, ctx: z.RefinementCtx): void {
  const keys = new Set<string>();
  const addKey = (key: string, i: number) => {
    if (keys.has(key)) ctx.addIssue({ code: "custom", path: ["items", i, "key"], message: "Chave repetida." });
    keys.add(key);
  };
  items.forEach((item, i) => {
    addKey(item.key, i);
    if (item.type === "vf") {
      const ids = item.statements.map((s) => s.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", path: ["items", i, "statements"], message: "Frases repetidas." });
      }
      ids.forEach((id) => addKey(statementKey(item.key, id), i));
      return;
    }
    const ids = item.options.map((o) => o.id);
    const labels = item.options.map((o) => o.label.toLocaleLowerCase("pt-BR"));
    if (new Set(ids).size !== ids.length || new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: "custom", path: ["items", i, "options"], message: "Respostas repetidas." });
    }
    const correct = item.type === "escolha" ? [item.correctId] : item.correctIds;
    if (!correct.every((id) => ids.includes(id)) || new Set(correct).size !== correct.length) {
      ctx.addIssue({ code: "custom", path: ["items", i], message: "A resposta certa precisa estar entre as opções." });
    }
    // Marcar todas com tudo certo não pede nenhuma escolha: precisa sobrar ao menos uma diferente.
    if (item.type === "marcar" && correct.length >= ids.length) {
      ctx.addIssue({ code: "custom", path: ["items", i, "correctIds"], message: "Deixe pelo menos uma resposta que não vale." });
    }
  });
}

const sheetContent = z
  .object({
    support: z
      .object({ text: text(MAX_SHEET_TEXT).optional(), icon: icon.optional(), example: text(MAX_EXAMPLE_TEXT).optional() })
      .strict()
      .optional(),
    items: z.array(sheetExercise).min(1).max(MAX_SHEET_EXERCISES),
  })
  .strict()
  .superRefine(checkSheet);

const freeStimulus = (support?: string, supportIcon?: IconName): Stimulus => ({
  kind: "free",
  ...(support ? { text: support } : {}),
  ...(supportIcon ? { icon: supportIcon } : {}),
});

const playOption = (o: { id: string; label: string; icon?: IconName }): PlayOption => ({
  id: o.id,
  label: o.label,
  ...(o.icon ? { icon: o.icon } : {}),
});

export const TRUE_FALSE_OPTIONS: PlayOption[] = [
  { id: "v", label: "Verdadeiro" },
  { id: "f", label: "Falso" },
];

/** A folha vira uma lista de passos que a tela já sabe jogar (o V/F vira um passo por frase). */
function sheetPlayItems(items: SheetExercise[]): PlayItem[] {
  const total = items.length;
  return items.flatMap((ex, i): PlayItem[] => {
    const base = { prompt: ex.prompt, ...(ex.hint ? { hint: ex.hint } : {}) };
    const exercise = { index: i + 1, total };
    if (ex.type === "vf") {
      return ex.statements.map((s, j) => ({
        ...base,
        key: statementKey(ex.key, s.id),
        options: TRUE_FALSE_OPTIONS,
        correctId: s.correct ? "v" : "f",
        fixedOrder: true,
        stimulus: freeStimulus(s.text, j === 0 ? ex.supportIcon : undefined),
        exercise: { ...exercise, part: { index: j + 1, total: ex.statements.length } },
      }));
    }
    return [
      {
        ...base,
        key: ex.key,
        options: ex.options.map(playOption),
        correctId: ex.type === "escolha" ? ex.correctId : ex.correctIds[0]!,
        ...(ex.type === "marcar" ? { correctIds: ex.correctIds } : {}),
        stimulus: freeStimulus(ex.support, ex.supportIcon),
        exercise,
      },
    ];
  });
}

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
  FOLHA: sheetContent,
  // Uma configuração só: o nome (e portanto as letras) vem de cada aluno na hora de jogar.
  NOME: z
    .object({
      items: z
        .array(
          z
            .object({
              key: z.literal("nome"),
              prompt: text(120),
              extraLetters: z.number().int().min(0).max(MAX_EXTRA_LETTERS),
              letterCase: z.enum(LETTER_CASES),
              showModel: z.boolean(),
            })
            .strict(),
        )
        .length(1),
    })
    .strict(),
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
  /**
   * `name` só no módulo NOME (que não tem itens de escolha: o quadro é montado por aluno).
   * `sheet` só na FOLHA: o bloco de apoio mostrado acima de todos os exercícios.
   */
  | { success: true; content: unknown; items: PlayItem[]; name?: NameConfig; sheet?: SheetSupport }
  | { success: false };

/** Valida o JSON do banco/da API e devolve o conteúdo já sanitizado + os itens normalizados. */
export function parseActivityContent(module: string, raw: unknown): ParsedContent {
  if (!isSupportedModule(module)) return { success: false };
  const result = contentSchemas[module].safeParse(raw);
  if (!result.success) return { success: false };
  if (module === "NOME") {
    const name = (result.data as { items: NameConfig[] }).items[0]!;
    return { success: true, content: result.data, items: [], name };
  }
  if (module === "FOLHA") {
    const data = result.data as { support?: SheetSupport; items: SheetExercise[] };
    return { success: true, content: data, items: sheetPlayItems(data.items), sheet: data.support ?? {} };
  }

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
    markerStyle: z.enum(MARKER_STYLES).default(DEFAULT_MARKER_STYLE),
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
    /** Só muda a apresentação das dicas: pode mudar mesmo com sessões gravadas. */
    markerStyle: z.enum(MARKER_STYLES).optional(),
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
