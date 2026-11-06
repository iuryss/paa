import { z } from "zod";
import { DEFAULT_MARKER_STYLE, MARKER_STYLES } from "@/lib/activities/markers";
import { LETTER_CASES, MAX_EXTRA_LETTERS, type NameConfig } from "@/lib/activities/name";
import { sanitizeText } from "@/lib/sanitize";
import { imageIdSchema } from "@/lib/validation/images";

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
  | { kind: "free"; text?: string; icon?: IconName; image?: ImageRef };

/** Imagem enviada pelo professor: o id e o texto alternativo (copiado na hora de escolher). */
export interface ImageRef {
  id: string;
  alt: string;
}

export interface PlayOption {
  id: string;
  label: string;
  icon?: IconName;
  image?: ImageRef;
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
  /** Encaixar (lacunas, ligar pares): casas em ordem + peças. Sem opções de escolha. */
  place?: PlacePlay;
  stimulus: Stimulus;
}

/** A regra de "certo" de um passo, a mesma no navegador e no servidor. */
export function isCorrectOption(item: PlayItem, optionId: string): boolean {
  return item.correctIds ? item.correctIds.includes(optionId) : optionId === item.correctId;
}

export const ORDER_MODES = ["letras", "palavras", "passos"] as const;
export type OrderMode = (typeof ORDER_MODES)[number];

/** Algo que vira peça ou item de coluna: texto sempre, figura e imagem opcionais. */
export interface PlaceCard {
  label: string;
  icon?: IconName;
  image?: ImageRef;
}

export interface PlacePlay {
  mode: "lacunas" | "ligar" | "ordenar" | "nomear" | "classificar";
  /** Uma casa por lacuna (ou por item da esquerda), na ordem em que são preenchidas. */
  slots: { key: string; expected: string }[];
  /** As peças: palavras do banco (lacunas) ou os itens da direita (ligar). */
  tiles: (PlaceCard & { id: string; value: string })[];
  /** Lacunas: o texto em pedaços; null marca uma lacuna (na ordem das casas). */
  segments?: (string | null)[];
  /** Ligar: os itens da esquerda, na ordem das casas. */
  left?: PlaceCard[];
  /** Ordenar: letras (lado a lado, sem espaço), palavras (formando a frase) ou passos (lista numerada). */
  order?: OrderMode;
  /** Nomear: a figura de cada casa (o nome é a resposta, então não vem aqui). */
  figures?: { icon?: IconName; image?: ImageRef }[];
  /** Classificar: o cartão de cada casa, na ordem em que aparecem. As peças são as caixas. */
  cards?: PlaceCard[];
}

/**
 * Confere uma tentativa no servidor: escolha (opção certa) ou encaixe (a peça vale o que a casa espera).
 * null = tentativa inválida (casa ou peça que não existem nesta atividade).
 */
export function judgeAttempt(items: PlayItem[], itemKey: string, optionId: string): boolean | null {
  for (const item of items) {
    if (item.place) {
      const slot = item.place.slots.find((sl) => sl.key === itemKey);
      if (!slot) continue;
      const tile = item.place.tiles.find((t) => t.id === optionId);
      return tile ? tile.value === slot.expected : null;
    }
    if (item.key === itemKey) {
      return item.options.some((o) => o.id === optionId) ? isCorrectOption(item, optionId) : null;
    }
  }
  return null;
}

// ───────────── Schemas de conteúdo (validação + sanitização) ─────────────

const text = (max: number) => z.string().transform(sanitizeText).pipe(z.string().min(1).max(max));
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const icon = z.enum(ICON_NAMES);
/** Só a referência: a imagem em si fica na tabela Image e é servida por /api/imagens/[id]. */
const imageRef = z.object({ id: imageIdSchema, alt: text(120) }).strict();

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
export const EXERCISE_TYPES = ["escolha", "marcar", "vf", "lacunas", "ligar", "ordenar", "nomear", "classificar"] as const;
export const MAX_GAPS = 8;
export const MAX_EXTRA_WORDS = 6;
export const MIN_PAIRS = 2;
export const MAX_PAIRS = 5;
export const MIN_PIECES = 2;
export const MAX_PIECES = 12;
export const MAX_FIGURES = 6;
export const MAX_NAME_EXTRAS = 4;
export const MIN_GROUPS = 2;
export const MAX_GROUPS = 4;
export const MAX_CARDS = 10;

/** "A matéria tem [massa] e [volume]." → pedaços do texto e as palavras escondidas. */
export function parseGaps(textWithGaps: string): { segments: (string | null)[]; answers: string[] } {
  const segments: (string | null)[] = [];
  const answers: string[] = [];
  let last = 0;
  for (const match of textWithGaps.matchAll(/\[([^\[\]]+)\]/g)) {
    if (match.index! > last) segments.push(textWithGaps.slice(last, match.index));
    segments.push(null);
    answers.push(match[1]!.trim());
    last = match.index! + match[0].length;
  }
  if (last < textWithGaps.length) segments.push(textWithGaps.slice(last));
  return { segments, answers };
}

/** Comparação de palavras do banco: ignora maiúsculas e espaços nas pontas (acento conta). */
export const wordValue = (word: string) => word.trim().toLocaleLowerCase("pt-BR");
/** Chave de telemetria de cada lacuna e de cada par: "item-2-l1", "item-3-p1". */
export const gapKey = (exerciseKey: string, index: number) => `${exerciseKey}-l${index + 1}`;
export const pairKey = (exerciseKey: string, pairId: string) => `${exerciseKey}-${pairId}`;
/** Chaves de ordenar, nomear e classificar: "item-2-o1", "item-3-n1", "item-4-c1". */
export const orderKey = (exerciseKey: string, index: number) => `${exerciseKey}-o${index + 1}`;
export const figureKey = (exerciseKey: string, index: number) => `${exerciseKey}-n${index + 1}`;
export const cardKey = (exerciseKey: string, cardId: string) => `${exerciseKey}-${cardId}`;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Bloco de apoio no topo da folha. `**palavra**` no texto vira destaque. */
export interface SheetSupport {
  text?: string;
  icon?: IconName;
  image?: ImageRef;
  example?: string;
}

const sheetOption = z.object({ id: slug, label: text(40), icon: icon.optional(), image: imageRef.optional() }).strict();
const exerciseBase = {
  key: slug,
  prompt: text(120),
  hint: text(120).optional(),
  support: text(MAX_SUPPORT_TEXT).optional(),
  supportIcon: icon.optional(),
  supportImage: imageRef.optional(),
};

const pairSide = z.object({ label: text(40), icon: icon.optional(), image: imageRef.optional() }).strict();

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
  /** Completar lacunas: palavras entre [colchetes] somem e vão para o banco, com as extras. */
  z
    .object({
      type: z.literal("lacunas"),
      ...exerciseBase,
      text: text(400),
      extras: z.array(text(30)).max(MAX_EXTRA_WORDS).default([]),
    })
    .strict(),
  /** Ordenar: peças na ordem certa (letras de uma palavra, palavras de uma frase ou passos). */
  z
    .object({
      type: z.literal("ordenar"),
      ...exerciseBase,
      order: z.enum(ORDER_MODES),
      pieces: z.array(text(60)).min(MIN_PIECES).max(MAX_PIECES),
    })
    .strict(),
  /** Nomear imagens: cada figura com a sua palavra; as palavras vão para o banco, com as extras. */
  z
    .object({
      type: z.literal("nomear"),
      ...exerciseBase,
      figures: z
        .array(z.object({ icon: icon.optional(), image: imageRef.optional(), answer: text(30) }).strict())
        .min(MIN_PAIRS)
        .max(MAX_FIGURES),
      extras: z.array(text(30)).max(MAX_NAME_EXTRAS).default([]),
    })
    .strict(),
  /** Classificar: cada cartão vai para a sua caixa (vários para um). */
  z
    .object({
      type: z.literal("classificar"),
      ...exerciseBase,
      groups: z.array(z.object({ id: slug, ...pairSide.shape }).strict()).min(MIN_GROUPS).max(MAX_GROUPS),
      cards: z
        .array(z.object({ id: slug, group: slug, ...pairSide.shape }).strict())
        .min(MIN_PAIRS)
        .max(MAX_CARDS),
    })
    .strict(),
  /** Ligar pares (um para um): cada item da esquerda com o seu par da direita. */
  z
    .object({
      type: z.literal("ligar"),
      ...exerciseBase,
      pairs: z
        .array(z.object({ id: slug, left: pairSide, right: pairSide }).strict())
        .min(MIN_PAIRS)
        .max(MAX_PAIRS),
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
    if (item.type === "lacunas") {
      const { answers } = parseGaps(item.text);
      if (answers.length < 1 || answers.length > MAX_GAPS || answers.some((a) => !a || a.length > 30)) {
        ctx.addIssue({ code: "custom", path: ["items", i, "text"], message: `Use de 1 a ${MAX_GAPS} palavras entre [colchetes].` });
      }
      const hidden = new Set(answers.map(wordValue));
      // Uma "extra" igual a uma escondida seria outra resposta certa: confunde.
      if (item.extras.some((w) => hidden.has(wordValue(w))) || new Set(item.extras.map(wordValue)).size !== item.extras.length) {
        ctx.addIssue({ code: "custom", path: ["items", i, "extras"], message: "Palavras extras repetidas ou iguais a uma resposta." });
      }
      answers.forEach((_, g) => addKey(gapKey(item.key, g), i));
      return;
    }
    if (item.type === "ordenar") {
      if (item.order === "letras" && item.pieces.some((piece) => [...piece].length !== 1)) {
        ctx.addIssue({ code: "custom", path: ["items", i, "pieces"], message: "No modo letras, cada peça é uma letra." });
      }
      if (new Set(item.pieces.map(wordValue)).size < 2) {
        ctx.addIssue({ code: "custom", path: ["items", i, "pieces"], message: "Com todas as peças iguais não há o que ordenar." });
      }
      item.pieces.forEach((_, n) => addKey(orderKey(item.key, n), i));
      return;
    }
    if (item.type === "nomear") {
      if (item.figures.some((f) => !f.icon && !f.image)) {
        ctx.addIssue({ code: "custom", path: ["items", i, "figures"], message: "Cada item precisa de figura ou imagem." });
      }
      const answers = item.figures.map((f) => wordValue(f.answer));
      const extras = item.extras.map(wordValue);
      if (new Set(answers).size !== answers.length || new Set([...answers, ...extras]).size !== answers.length + extras.length) {
        ctx.addIssue({ code: "custom", path: ["items", i, "figures"], message: "Palavras repetidas." });
      }
      item.figures.forEach((_, n) => addKey(figureKey(item.key, n), i));
      return;
    }
    if (item.type === "classificar") {
      const groupIds = item.groups.map((g) => g.id);
      const groupLabels = item.groups.map((g) => wordValue(g.label));
      const cardIds = item.cards.map((c) => c.id);
      if (new Set(groupIds).size !== groupIds.length || new Set(groupLabels).size !== groupLabels.length || new Set(cardIds).size !== cardIds.length) {
        ctx.addIssue({ code: "custom", path: ["items", i], message: "Caixas ou cartões repetidos." });
      }
      if (item.cards.some((c) => !groupIds.includes(c.group))) {
        ctx.addIssue({ code: "custom", path: ["items", i, "cards"], message: "Cartão numa caixa que não existe." });
      }
      if (groupIds.some((id) => !item.cards.some((c) => c.group === id))) {
        ctx.addIssue({ code: "custom", path: ["items", i, "groups"], message: "Toda caixa precisa de pelo menos um cartão." });
      }
      cardIds.forEach((id) => addKey(cardKey(item.key, id), i));
      return;
    }
    if (item.type === "ligar") {
      const ids = item.pairs.map((pr) => pr.id);
      const lefts = item.pairs.map((pr) => wordValue(pr.left.label));
      const rights = item.pairs.map((pr) => wordValue(pr.right.label));
      if (new Set(ids).size !== ids.length || new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
        ctx.addIssue({ code: "custom", path: ["items", i, "pairs"], message: "Pares repetidos." });
      }
      ids.forEach((id) => addKey(pairKey(item.key, id), i));
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
      .object({
        text: text(MAX_SHEET_TEXT).optional(),
        icon: icon.optional(),
        image: imageRef.optional(),
        example: text(MAX_EXAMPLE_TEXT).optional(),
      })
      .strict()
      .optional(),
    items: z.array(sheetExercise).min(1).max(MAX_SHEET_EXERCISES),
  })
  .strict()
  .superRefine(checkSheet);

const freeStimulus = (support?: string, supportIcon?: IconName, supportImage?: ImageRef): Stimulus => ({
  kind: "free",
  ...(support ? { text: support } : {}),
  ...(supportIcon ? { icon: supportIcon } : {}),
  ...(supportImage ? { image: supportImage } : {}),
});

const playOption = (o: { id: string; label: string; icon?: IconName; image?: ImageRef }): PlayOption => ({
  id: o.id,
  label: o.label,
  ...(o.icon ? { icon: o.icon } : {}),
  ...(o.image ? { image: o.image } : {}),
});

const card = (c: { label: string; icon?: IconName; image?: ImageRef }): PlaceCard => ({
  label: c.label,
  ...(c.icon ? { icon: c.icon } : {}),
  ...(c.image ? { image: c.image } : {}),
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
    if (ex.type === "lacunas") {
      const { segments, answers } = parseGaps(ex.text);
      const words = [...answers, ...ex.extras];
      return [
        {
          ...base,
          key: ex.key,
          options: [],
          correctId: "",
          stimulus: freeStimulus(ex.support, ex.supportIcon, ex.supportImage),
          exercise,
          place: {
            mode: "lacunas",
            slots: answers.map((a, g) => ({ key: gapKey(ex.key, g), expected: wordValue(a) })),
            // Ids pela ordem do conteúdo (respostas, depois extras): o servidor sabe qual palavra é cada peça.
            tiles: words.map((w, n) => ({ id: `w${n + 1}`, value: wordValue(w), label: w })),
            segments,
          },
        },
      ];
    }
    if (ex.type === "ordenar" || ex.type === "nomear" || ex.type === "classificar") {
      const step = {
        ...base,
        key: ex.key,
        options: [],
        correctId: "",
        stimulus: freeStimulus(ex.support, ex.supportIcon, ex.supportImage),
        exercise,
      };
      if (ex.type === "ordenar") {
        return [
          {
            ...step,
            place: {
              mode: "ordenar",
              order: ex.order,
              slots: ex.pieces.map((piece, n) => ({ key: orderKey(ex.key, n), expected: wordValue(piece) })),
              tiles: ex.pieces.map((piece, n) => ({ id: `t${n + 1}`, value: wordValue(piece), label: piece })),
            },
          },
        ];
      }
      if (ex.type === "nomear") {
        const words = [...ex.figures.map((f) => f.answer), ...ex.extras];
        return [
          {
            ...step,
            place: {
              mode: "nomear",
              slots: ex.figures.map((f, n) => ({ key: figureKey(ex.key, n), expected: wordValue(f.answer) })),
              tiles: words.map((w, n) => ({ id: `w${n + 1}`, value: wordValue(w), label: w })),
              figures: ex.figures.map((f) => ({ ...(f.icon ? { icon: f.icon } : {}), ...(f.image ? { image: f.image } : {}) })),
            },
          },
        ];
      }
      return [
        {
          ...step,
          place: {
            mode: "classificar",
            slots: ex.cards.map((c) => ({ key: cardKey(ex.key, c.id), expected: c.group })),
            tiles: ex.groups.map((g) => ({ id: g.id, value: g.id, ...card(g) })),
            cards: ex.cards.map((c) => card(c)),
          },
        },
      ];
    }
    if (ex.type === "ligar") {
      return [
        {
          ...base,
          key: ex.key,
          options: [],
          correctId: "",
          stimulus: freeStimulus(ex.support, ex.supportIcon, ex.supportImage),
          exercise,
          place: {
            mode: "ligar",
            slots: ex.pairs.map((pr) => ({ key: pairKey(ex.key, pr.id), expected: pr.id })),
            tiles: ex.pairs.map((pr) => ({ id: pr.id, value: pr.id, ...card(pr.right) })),
            left: ex.pairs.map((pr) => card(pr.left)),
          },
        },
      ];
    }
    if (ex.type === "vf") {
      return ex.statements.map((s, j) => ({
        ...base,
        key: statementKey(ex.key, s.id),
        options: TRUE_FALSE_OPTIONS,
        correctId: s.correct ? "v" : "f",
        fixedOrder: true,
        stimulus: freeStimulus(s.text, j === 0 ? ex.supportIcon : undefined, j === 0 ? ex.supportImage : undefined),
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
        stimulus: freeStimulus(ex.support, ex.supportIcon, ex.supportImage),
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
