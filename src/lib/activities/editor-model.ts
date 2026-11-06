import { MAX_MARKERS } from "@/lib/activities/markers";
import { MAX_EXTRA_LETTERS, type LetterCase } from "@/lib/activities/name";
import {
  DIRECTIONS,
  ICON_NAMES,
  MAX_EXAMPLE_TEXT,
  MAX_CARDS,
  MAX_FIGURES,
  MAX_GAPS,
  MAX_GROUPS,
  MAX_PAIRS,
  MAX_PIECES,
  MAX_SHEET_EXERCISES,
  MIN_GROUPS,
  MIN_PAIRS,
  MIN_PIECES,
  parseGaps,
  wordValue,
  MAX_SHEET_TEXT,
  MAX_STATEMENTS,
  MAX_SUPPORT_TEXT,
  type Direction,
  type ExerciseType,
  type IconName,
  type ImageRef,
  type OrderMode,
  type SheetSupport,
  type SupportedModule,
} from "@/lib/validation/activities";

export interface EditorAnswer {
  label: string;
  icon: IconName | "";
  image: ImageRef | null;
}

export interface EditorStatement {
  text: string;
  correct: boolean;
}

/** Bloco de apoio no topo da folha (vale para todos os exercícios). */
export interface SheetDraft {
  text: string;
  icon: IconName | "";
  image: ImageRef | null;
  example: string;
}

export const EMPTY_SHEET: SheetDraft = { text: "", icon: "", image: null, example: "" };

export const EXERCISE_LABEL: Record<ExerciseType, string> = {
  escolha: "Escolher a resposta certa",
  marcar: "Marcar todas as certas",
  vf: "Verdadeiro ou falso",
  lacunas: "Completar lacunas",
  ligar: "Ligar pares",
  ordenar: "Colocar em ordem",
  nomear: "Nomear imagens",
  classificar: "Separar em grupos",
};

export const ORDER_MODE_LABEL: Record<OrderMode, string> = {
  letras: "Letras de uma palavra",
  palavras: "Palavras de uma frase",
  passos: "Passos (um por linha)",
};

/** Nomear imagens: a figura (ícone ou imagem) e a palavra certa. */
export interface EditorFigure {
  icon: IconName | "";
  image: ImageRef | null;
  answer: string;
}

/** Separar em grupos: o cartão e o índice da caixa onde ele fica. */
export interface EditorCard extends EditorAnswer {
  group: number;
}

/** Ligar pares: o item da esquerda e o seu par da direita (texto, figura e imagem, como as respostas). */
export interface EditorPair {
  left: EditorAnswer;
  right: EditorAnswer;
}

/**
 * Modelo do editor do professor: um formulário guiado (nunca JSON cru).
 * Localização, Grafia e Matemática: o professor digita o enunciado e as opções ERRADAS; a resposta
 * certa é derivada do estímulo (letra minúscula, soma, direção).
 * Folha: o professor escreve TODAS as respostas e marca a(s) certa(s) (sempre há uma marcada).
 */
export interface EditorItem {
  /** Escrever o nome: quantas letras extras, maiúsculas ou como cadastrado, e se o modelo aparece. */
  nameExtra: number;
  nameCase: LetterCase;
  nameModel: boolean;
  /** Folha: o tipo do exercício. */
  exType: ExerciseType;
  /** Folha: texto e figura de apoio do exercício (opcionais). */
  supportText: string;
  supportIcon: IconName | "";
  /** Folha: imagem enviada pelo professor para o apoio do exercício. */
  supportImage: ImageRef | null;
  /** Folha (escolha e marcar todas): de 2 a 4 respostas. */
  answers: EditorAnswer[];
  /** Escolha: o índice da certa. */
  correctIndex: number;
  /** Marcar todas: os índices das certas. */
  correctSet: number[];
  /** Verdadeiro ou falso: as frases. */
  statements: EditorStatement[];
  /** Completar lacunas: a frase com as palavras escondidas entre [colchetes], e as palavras extras. */
  gapText: string;
  extras: string[];
  /** Ligar pares: de 2 a 5. */
  pairs: EditorPair[];
  /** Colocar em ordem: o tipo de peça e o texto na ordem certa. */
  orderMode: OrderMode;
  orderText: string;
  /** Nomear imagens: as figuras (usa `extras` para as palavras a mais). */
  figures: EditorFigure[];
  /** Separar em grupos: as caixas e os cartões. */
  groups: EditorAnswer[];
  cards: EditorCard[];
  prompt: string;
  hint: string;
  /** Grafia e Matemática: de 1 a 3 opções erradas. */
  distractors: string[];
  /** Grafia: a letra maiúscula mostrada. */
  display: string;
  /** Matemática: parcelas (0 a 10). */
  a: number;
  b: number;
  /** Localização: a peça e onde ela fica no mapa. */
  pieceLabel: string;
  pieceIcon: IconName | "";
  position: Direction;
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
};

export const ICON_LABEL: Record<IconName, string> = {
  norte: "Seta para cima",
  sul: "Seta para baixo",
  leste: "Seta para a direita",
  oeste: "Seta para a esquerda",
  casa: "Casa",
  escola: "Escola",
  arvore: "Árvore",
  maca: "Maçã",
  estrela: "Estrela",
  circulo: "Círculo",
  sol: "Sol",
  lua: "Lua",
  nuvem: "Nuvem",
  chuva: "Chuva",
  agua: "Água",
  flor: "Flor",
  cachorro: "Cachorro",
  gato: "Gato",
  peixe: "Peixe",
  passaro: "Pássaro",
  banana: "Banana",
  cenoura: "Cenoura",
  leite: "Leite",
  comida: "Comida (prato e talheres)",
  carro: "Carro",
  onibus: "Ônibus",
  livro: "Livro",
  roupa: "Roupa",
  cama: "Cama",
  banho: "Banho",
  mao: "Mão",
  musica: "Música",
  coracao: "Coração",
  feliz: "Rosto feliz",
  triste: "Rosto triste",
};

/** Pictogramas oferecidos para as peças do mapa (as setas de direção ficam de fora). */
export const PIECE_ICONS = ICON_NAMES.filter((n) => !DIRECTIONS.includes(n as Direction));

export const MIN_DISTRACTORS = 1;
export const MAX_DISTRACTORS = 3;
export const MIN_ANSWERS = 2;
/** Uma resposta por marcador (círculo, triângulo, quadrado, estrela). */
export const MAX_ANSWERS = MAX_MARKERS;
export const MAX_ITEMS = 20;

const emptyAnswer = (): EditorAnswer => ({ label: "", icon: "", image: null });
const emptyStatement = (): EditorStatement => ({ text: "", correct: true });
const emptyPair = (): EditorPair => ({ left: emptyAnswer(), right: emptyAnswer() });

const emptyFigure = (): EditorFigure => ({ icon: "", image: null, answer: "" });
const emptyCard = (group: number): EditorCard => ({ ...emptyAnswer(), group });

export function addFigure(item: EditorItem): EditorItem {
  if (item.figures.length >= MAX_FIGURES) return item;
  return { ...item, figures: [...item.figures, emptyFigure()] };
}

export function addGroup(item: EditorItem): EditorItem {
  if (item.groups.length >= MAX_GROUPS) return item;
  return { ...item, groups: [...item.groups, emptyAnswer()] };
}

export function addCard(item: EditorItem): EditorItem {
  if (item.cards.length >= MAX_CARDS) return item;
  return { ...item, cards: [...item.cards, emptyCard(0)] };
}

/** Remove uma caixa: os cartões dela passam para a 1ª caixa, e os índices das seguintes se ajustam. */
export function removeGroup(item: EditorItem, index: number): EditorItem {
  return {
    ...item,
    groups: item.groups.filter((_, i) => i !== index),
    cards: item.cards.map((c) => ({ ...c, group: c.group === index ? 0 : c.group > index ? c.group - 1 : c.group })),
  };
}

/** O texto do professor vira as peças, na ordem certa. */
export function orderPieces(mode: OrderMode, text: string): string[] {
  if (mode === "letras") return [...text.replace(/\s/g, "")];
  if (mode === "palavras") return text.split(/\s+/).filter(Boolean);
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function addPair(item: EditorItem): EditorItem {
  if (item.pairs.length >= MAX_PAIRS) return item;
  return { ...item, pairs: [...item.pairs, emptyPair()] };
}

export function emptyItem(module: SupportedModule, exType: ExerciseType = "escolha"): EditorItem {
  const base: EditorItem = {
    nameExtra: 3,
    nameCase: "MAIUSCULAS",
    nameModel: true,
    exType,
    supportText: "",
    supportIcon: "",
    supportImage: null,
    answers: [],
    correctIndex: 0,
    correctSet: [],
    statements: [],
    gapText: "",
    extras: [],
    pairs: [],
    orderMode: "palavras",
    orderText: "",
    figures: [],
    groups: [],
    cards: [],
    prompt: "",
    hint: "",
    distractors: [],
    display: "",
    a: 1,
    b: 1,
    pieceLabel: "",
    pieceIcon: "",
    position: "norte",
  };
  if (module === "GRAFIA") return { ...base, distractors: ["", ""] };
  if (module === "MATEMATICA") return { ...base, distractors: ["", ""] };
  if (module === "NOME") return { ...base, prompt: "Escreva seu nome" };
  if (module === "FOLHA") {
    if (exType === "vf") return { ...base, prompt: "É verdadeiro ou falso?", statements: [emptyStatement(), emptyStatement()] };
    if (exType === "lacunas") return { ...base, prompt: "Complete com as palavras", extras: [""] };
    if (exType === "ligar") return { ...base, prompt: "Ligue cada um ao seu par", pairs: [emptyPair(), emptyPair()] };
    if (exType === "ordenar") return { ...base, prompt: "Coloque na ordem certa" };
    if (exType === "nomear") return { ...base, prompt: "Dê o nome de cada figura", figures: [emptyFigure(), emptyFigure()] };
    if (exType === "classificar") {
      return { ...base, prompt: "Separe nas caixas", groups: [emptyAnswer(), emptyAnswer()], cards: [emptyCard(0), emptyCard(1)] };
    }
    if (exType === "marcar") return { ...base, answers: [emptyAnswer(), emptyAnswer(), emptyAnswer()], correctSet: [0] };
    return { ...base, answers: [emptyAnswer(), emptyAnswer()] };
  }
  return base;
}

/** Remove uma resposta sem perder qual é (ou quais são) a(s) certa(s). Se a certa sair, a 1ª passa a ser. */
export function removeAnswer(item: EditorItem, index: number): EditorItem {
  const answers = item.answers.filter((_, i) => i !== index);
  const shift = (i: number) => (i > index ? i - 1 : i);
  const correctIndex = index === item.correctIndex ? 0 : shift(item.correctIndex);
  const kept = item.correctSet.filter((i) => i !== index).map(shift);
  return { ...item, answers, correctIndex, correctSet: kept.length > 0 ? kept : [0] };
}

/** Marcar todas: liga/desliga uma resposta como certa (sempre fica pelo menos uma marcada). */
export function toggleCorrect(item: EditorItem, index: number): EditorItem {
  const has = item.correctSet.includes(index);
  const next = has ? item.correctSet.filter((i) => i !== index) : [...item.correctSet, index].sort((a, b) => a - b);
  return next.length === 0 ? item : { ...item, correctSet: next };
}

export function addStatement(item: EditorItem): EditorItem {
  if (item.statements.length >= MAX_STATEMENTS) return item;
  return { ...item, statements: [...item.statements, emptyStatement()] };
}

export function addAnswer(item: EditorItem): EditorItem {
  if (item.answers.length >= MAX_ANSWERS) return item;
  return { ...item, answers: [...item.answers, emptyAnswer()] };
}

/** "Árvore" → "arvore"; vazio vira o índice. Garante ids válidos no schema (a-z, 0-9, hífen). */
function slug(label: string, index: number): string {
  const clean = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return clean || `opcao-${index + 1}`;
}

/** Ids estáveis e únicos a partir dos rótulos ("Árvore" → "o-arvore"). */
function uniqueIds(prefix: string, labels: string[]): string[] {
  const used = new Set<string>();
  return labels.map((label, i) => {
    let id = `${prefix}-${slug(label, i)}`;
    while (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    return id;
  });
}

function buildOptions(prefix: string, correct: string, distractors: string[]) {
  const labels = [correct, ...distractors.map((d) => d.trim()).filter(Boolean)];
  const ids = uniqueIds(prefix, labels);
  const options = labels.map((label, i) => ({ id: ids[i]!, label }));
  return { options, correctId: options[0]!.id };
}

const optionalHint = (hint: string) => (hint.trim() ? { hint: hint.trim() } : {});

function correctLabel(module: SupportedModule, item: EditorItem): string {
  if (module === "GRAFIA") return item.display.trim().toLowerCase();
  if (module === "MATEMATICA") return String(item.a + item.b);
  return item.position;
}

const cleanImage = (image: ImageRef): ImageRef => ({ id: image.id, alt: image.alt.trim() });

function sheetToContent(sheet: SheetDraft): { support?: SheetSupport } {
  const support: SheetSupport = {
    ...(sheet.text.trim() ? { text: sheet.text.trim() } : {}),
    ...(sheet.icon ? { icon: sheet.icon } : {}),
    ...(sheet.image ? { image: cleanImage(sheet.image) } : {}),
    ...(sheet.example.trim() ? { example: sheet.example.trim() } : {}),
  };
  return Object.keys(support).length > 0 ? { support } : {};
}

/** Exercício da folha → JSON (ids estáveis a partir dos textos; a certa vem do que o professor marcou). */
function exerciseToContent(item: EditorItem, common: Record<string, unknown>) {
  const support = {
    ...(item.supportText.trim() ? { support: item.supportText.trim() } : {}),
    ...(item.supportIcon ? { supportIcon: item.supportIcon } : {}),
    ...(item.supportImage ? { supportImage: cleanImage(item.supportImage) } : {}),
  };
  const side = (a: EditorAnswer) => ({
    label: a.label.trim(),
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.image ? { image: cleanImage(a.image) } : {}),
  });
  if (item.exType === "ordenar") {
    return { type: "ordenar", ...common, ...support, order: item.orderMode, pieces: orderPieces(item.orderMode, item.orderText) };
  }
  if (item.exType === "nomear") {
    return {
      type: "nomear",
      ...common,
      ...support,
      figures: item.figures.map((f) => ({
        ...(f.icon ? { icon: f.icon } : {}),
        ...(f.image ? { image: cleanImage(f.image) } : {}),
        answer: f.answer.trim(),
      })),
      extras: item.extras.map((w) => w.trim()).filter(Boolean),
    };
  }
  if (item.exType === "classificar") {
    return {
      type: "classificar",
      ...common,
      ...support,
      groups: item.groups.map((g, j) => ({ id: `g${j + 1}`, ...side(g) })),
      cards: item.cards.map((c, j) => ({ id: `c${j + 1}`, group: `g${c.group + 1}`, ...side(c) })),
    };
  }
  if (item.exType === "lacunas") {
    return {
      type: "lacunas",
      ...common,
      ...support,
      text: item.gapText.trim(),
      extras: item.extras.map((w) => w.trim()).filter(Boolean),
    };
  }
  if (item.exType === "ligar") {
    return {
      type: "ligar",
      ...common,
      ...support,
      pairs: item.pairs.map((pr, j) => ({ id: `p${j + 1}`, left: side(pr.left), right: side(pr.right) })),
    };
  }
  if (item.exType === "vf") {
    return {
      type: "vf",
      ...common,
      ...support,
      statements: item.statements.map((s, j) => ({ id: `s${j + 1}`, text: s.text.trim(), correct: s.correct })),
    };
  }
  const labels = item.answers.map((a) => a.label.trim());
  const ids = uniqueIds("o", labels);
  const options = item.answers.map((a, j) => ({
    id: ids[j]!,
    label: labels[j]!,
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.image ? { image: cleanImage(a.image) } : {}),
  }));
  if (item.exType === "marcar") {
    return { type: "marcar", ...common, ...support, options, correctIds: item.correctSet.map((j) => ids[j] ?? "") };
  }
  return { type: "escolha", ...common, ...support, options, correctId: ids[item.correctIndex] ?? "" };
}

/** Editor → JSON no formato validado por `contentSchemas`. A folha também leva o bloco de apoio. */
export function toContent(
  module: SupportedModule,
  items: EditorItem[],
  sheet: SheetDraft = EMPTY_SHEET,
): { items: unknown[]; support?: SheetSupport } {
  return {
    ...(module === "FOLHA" ? sheetToContent(sheet) : {}),
    items: items.map((item, i) => {
      const key = `item-${i + 1}`;
      const common = { key, prompt: item.prompt.trim(), ...optionalHint(item.hint) };

      if (module === "LOCALIZACAO") {
        return {
          ...common,
          piece: {
            label: item.pieceLabel.trim(),
            ...(item.pieceIcon ? { icon: item.pieceIcon } : {}),
          },
          position: item.position,
          options: DIRECTIONS.map((d) => ({ id: d, label: DIRECTION_LABEL[d], icon: d })),
          correctId: item.position,
        };
      }
      if (module === "NOME") {
        return {
          key: "nome",
          prompt: item.prompt.trim(),
          extraLetters: item.nameExtra,
          letterCase: item.nameCase,
          showModel: item.nameModel,
        };
      }
      if (module === "FOLHA") return exerciseToContent(item, common);
      if (module === "GRAFIA") {
        return {
          ...common,
          display: item.display.trim(),
          ...buildOptions("l", correctLabel(module, item), item.distractors),
        };
      }
      return {
        ...common,
        a: item.a,
        b: item.b,
        ...buildOptions("n", correctLabel(module, item), item.distractors),
      };
    }),
  };
}

interface StoredCard {
  label: string;
  icon?: IconName;
  image?: ImageRef;
}

interface StoredItem {
  prompt: string;
  hint?: string;
  /** Folha: o tipo do exercício. */
  type?: ExerciseType;
  /** Ausentes no módulo NOME (só configuração) e no V/F. */
  options?: { id: string; label: string; icon?: IconName; image?: ImageRef }[];
  correctId?: string;
  correctIds?: string[];
  statements?: { id: string; text: string; correct: boolean }[];
  text?: string;
  extras?: string[];
  pairs?: { id: string; left: StoredCard; right: StoredCard }[];
  order?: OrderMode;
  pieces?: string[];
  figures?: { icon?: IconName; image?: ImageRef; answer: string }[];
  groups?: (StoredCard & { id: string })[];
  cards?: (StoredCard & { id: string; group: string })[];
  extraLetters?: number;
  letterCase?: LetterCase;
  showModel?: boolean;
  support?: string;
  supportIcon?: IconName;
  supportImage?: ImageRef;
  piece?: { label: string; icon?: IconName };
  position?: Direction;
  display?: string;
  a?: number;
  b?: number;
}

const storedCard = (c: StoredCard): EditorAnswer => ({ label: c.label, icon: c.icon ?? "", image: c.image ?? null });

/** JSON já validado → editor (para abrir uma atividade existente). */
export function fromContent(module: SupportedModule, content: unknown): EditorItem[] {
  const items = ((content as { items?: StoredItem[] } | null)?.items ?? []) as StoredItem[];
  return items.map((s) => {
    const options = s.options ?? [];
    const isSheet = module === "FOLHA";
    return {
      ...emptyItem(module, s.type),
      prompt: s.prompt,
      hint: s.hint ?? "",
      distractors:
        module === "GRAFIA" || module === "MATEMATICA"
          ? options.filter((o) => o.id !== s.correctId).map((o) => o.label)
          : [],
      nameExtra: s.extraLetters ?? 3,
      nameCase: s.letterCase ?? "MAIUSCULAS",
      nameModel: s.showModel ?? true,
      supportText: s.support ?? "",
      supportIcon: s.supportIcon ?? "",
      supportImage: s.supportImage ?? null,
      answers: isSheet ? options.map((o) => ({ label: o.label, icon: o.icon ?? "", image: o.image ?? null })) : [],
      correctIndex: isSheet ? Math.max(0, options.findIndex((o) => o.id === s.correctId)) : 0,
      correctSet: (s.correctIds ?? []).map((id) => options.findIndex((o) => o.id === id)).filter((j) => j >= 0),
      statements: (s.statements ?? []).map((st) => ({ text: st.text, correct: st.correct })),
      gapText: s.text ?? "",
      extras: s.extras ?? [],
      pairs: (s.pairs ?? []).map((pr) => ({ left: storedCard(pr.left), right: storedCard(pr.right) })),
      orderMode: s.order ?? "palavras",
      orderText: (s.pieces ?? []).join(s.order === "letras" ? "" : s.order === "passos" ? "\n" : " "),
      figures: (s.figures ?? []).map((f) => ({ icon: f.icon ?? "", image: f.image ?? null, answer: f.answer })),
      groups: (s.groups ?? []).map(storedCard),
      cards: (s.cards ?? []).map((c) => ({
        ...storedCard(c),
        group: Math.max(0, (s.groups ?? []).findIndex((g) => g.id === c.group)),
      })),
      display: s.display ?? "",
      a: s.a ?? 1,
      b: s.b ?? 1,
      pieceLabel: s.piece?.label ?? "",
      pieceIcon: s.piece?.icon ?? "",
      position: s.position ?? "norte",
    };
  });
}

/**
 * Mensagens em português, item a item, ANTES de chamar a API.
 * (O schema Zod continua sendo a barreira final no servidor.)
 */
export function validateItems(module: SupportedModule, items: EditorItem[]): string[] {
  const errors: string[] = [];
  if (module === "NOME") {
    // Uma configuração só; as letras vêm do apelido de cada aluno.
    if (items.length !== 1) errors.push("Esta atividade tem uma configuração só.");
    const item = items[0];
    if (item && !item.prompt.trim()) errors.push("Escreva o pedido para a criança (ex.: Escreva seu nome).");
    if (item && (!Number.isInteger(item.nameExtra) || item.nameExtra < 0 || item.nameExtra > MAX_EXTRA_LETTERS)) {
      errors.push(`Use de 0 a ${MAX_EXTRA_LETTERS} letras extras.`);
    }
    return errors;
  }
  if (items.length === 0) errors.push("Adicione pelo menos 1 item.");
  if (items.length > MAX_ITEMS) errors.push(`Use no máximo ${MAX_ITEMS} itens.`);
  if (module === "FOLHA" && items.length > MAX_SHEET_EXERCISES) {
    errors.push(`Uma folha tem no máximo ${MAX_SHEET_EXERCISES} exercícios.`);
  }

  items.forEach((item, i) => {
    const n = `${module === "FOLHA" ? "Exercício" : "Item"} ${i + 1}`;
    if (!item.prompt.trim()) errors.push(`${n}: escreva a pergunta.`);

    if (module === "LOCALIZACAO") {
      if (!item.pieceLabel.trim()) errors.push(`${n}: dê um nome para a peça (ex.: Escola).`);
      return;
    }

    if (module === "FOLHA") {
      const images = [item.supportImage, ...item.answers.map((a) => a.image)].filter((img): img is ImageRef => img !== null);
      if (images.some((img) => img.alt.trim().length < 3)) errors.push(`${n}: descreva cada imagem (para quem não enxerga).`);
      if (item.supportText.trim().length > MAX_SUPPORT_TEXT) {
        errors.push(`${n}: o texto de apoio pode ter até ${MAX_SUPPORT_TEXT} letras.`);
      }
      if (item.exType === "lacunas") {
        const { answers } = parseGaps(item.gapText);
        if (answers.length < 1) errors.push(`${n}: coloque entre [colchetes] as palavras que a criança vai encaixar.`);
        if (answers.length > MAX_GAPS) errors.push(`${n}: use no máximo ${MAX_GAPS} lacunas.`);
        if (answers.some((a) => !a || a.length > 30)) errors.push(`${n}: cada palavra entre colchetes pode ter até 30 letras.`);
        const hidden = new Set(answers.map(wordValue));
        const extras = item.extras.map((w) => w.trim()).filter(Boolean);
        if (extras.some((w) => hidden.has(wordValue(w)))) {
          errors.push(`${n}: uma palavra extra é igual a uma resposta (ela também valeria).`);
        }
        if (new Set(extras.map(wordValue)).size !== extras.length) errors.push(`${n}: há palavras extras repetidas.`);
        return;
      }
      if (item.exType === "ordenar") {
        const pieces = orderPieces(item.orderMode, item.orderText);
        if (pieces.length < MIN_PIECES || pieces.length > MAX_PIECES) {
          errors.push(`${n}: use de ${MIN_PIECES} a ${MAX_PIECES} peças para ordenar.`);
        } else if (new Set(pieces.map(wordValue)).size < 2) {
          errors.push(`${n}: com todas as peças iguais não há o que ordenar.`);
        }
        if (pieces.some((piece) => piece.length > 60)) errors.push(`${n}: cada peça pode ter até 60 letras.`);
        return;
      }
      if (item.exType === "nomear") {
        if (item.figures.length < MIN_PAIRS || item.figures.length > MAX_FIGURES) {
          errors.push(`${n}: use de ${MIN_PAIRS} a ${MAX_FIGURES} figuras.`);
        }
        item.figures.forEach((f, j) => {
          if (!f.icon && !f.image) errors.push(`${n}: escolha a figura ou imagem ${j + 1}.`);
          if (!f.answer.trim()) errors.push(`${n}: escreva o nome da figura ${j + 1}.`);
          if (f.image && f.image.alt.trim().length < 3) errors.push(`${n}: descreva cada imagem (para quem não enxerga).`);
        });
        const words = [...item.figures.map((f) => f.answer), ...item.extras].map(wordValue).filter(Boolean);
        if (new Set(words).size !== words.length) errors.push(`${n}: há palavras repetidas.`);
        return;
      }
      if (item.exType === "classificar") {
        if (item.groups.length < MIN_GROUPS || item.groups.length > MAX_GROUPS) {
          errors.push(`${n}: use de ${MIN_GROUPS} a ${MAX_GROUPS} caixas.`);
        }
        if (item.cards.length < MIN_PAIRS || item.cards.length > MAX_CARDS) {
          errors.push(`${n}: use de ${MIN_PAIRS} a ${MAX_CARDS} cartões.`);
        }
        item.groups.forEach((g, j) => {
          if (!g.label.trim()) errors.push(`${n}: escreva o nome da caixa ${j + 1}.`);
          else if (!item.cards.some((c) => c.group === j)) errors.push(`${n}: a caixa ${j + 1} não tem nenhum cartão.`);
        });
        item.cards.forEach((c, j) => {
          if (!c.label.trim()) errors.push(`${n}: escreva o cartão ${j + 1}.`);
        });
        const labels = item.groups.map((g) => wordValue(g.label)).filter(Boolean);
        if (new Set(labels).size !== labels.length) errors.push(`${n}: há caixas repetidas.`);
        const images = [...item.groups, ...item.cards].map((c) => c.image).filter((img): img is ImageRef => img !== null);
        if (images.some((img) => img.alt.trim().length < 3)) errors.push(`${n}: descreva cada imagem (para quem não enxerga).`);
        return;
      }
      if (item.exType === "ligar") {
        if (item.pairs.length < MIN_PAIRS || item.pairs.length > MAX_PAIRS) {
          errors.push(`${n}: use de ${MIN_PAIRS} a ${MAX_PAIRS} pares.`);
        }
        item.pairs.forEach((pr, j) => {
          if (!pr.left.label.trim() || !pr.right.label.trim()) errors.push(`${n}: escreva os dois lados do par ${j + 1}.`);
        });
        for (const side of ["left", "right"] as const) {
          const labels = item.pairs.map((pr) => wordValue(pr[side].label)).filter(Boolean);
          if (new Set(labels).size !== labels.length) {
            errors.push(`${n}: há ${side === "left" ? "itens" : "pares"} repetidos (cada um liga com um só).`);
          }
        }
        const pairImages = item.pairs.flatMap((pr) => [pr.left.image, pr.right.image]).filter((img): img is ImageRef => img !== null);
        if (pairImages.some((img) => img.alt.trim().length < 3)) errors.push(`${n}: descreva cada imagem (para quem não enxerga).`);
        return;
      }
      if (item.exType === "vf") {
        if (item.statements.length < 1 || item.statements.length > MAX_STATEMENTS) {
          errors.push(`${n}: use de 1 a ${MAX_STATEMENTS} frases.`);
        }
        item.statements.forEach((s, j) => {
          if (!s.text.trim()) errors.push(`${n}: escreva a frase ${j + 1} (ou remova-a).`);
        });
        return;
      }
      if (item.exType === "marcar") {
        if (item.correctSet.length < 1) errors.push(`${n}: marque pelo menos uma resposta certa.`);
        if (item.correctSet.length >= item.answers.length) {
          errors.push(`${n}: deixe pelo menos uma resposta que não vale (senão não há o que escolher).`);
        }
      }
      const labels = item.answers.map((a) => a.label.trim());
      if (labels.length < MIN_ANSWERS || labels.length > MAX_ANSWERS) {
        errors.push(`${n}: use de ${MIN_ANSWERS} a ${MAX_ANSWERS} respostas.`);
      }
      labels.forEach((label, j) => {
        if (!label) errors.push(`${n}: escreva a resposta ${j + 1} (ou remova-a).`);
      });
      const filled = labels.filter(Boolean).map((l) => l.toLocaleLowerCase("pt-BR"));
      if (new Set(filled).size !== filled.length) errors.push(`${n}: há respostas repetidas.`);
      if (item.exType === "escolha" && (item.correctIndex < 0 || item.correctIndex >= labels.length)) {
        errors.push(`${n}: marque qual é a resposta certa.`);
      }
      return;
    }

    const filled = item.distractors.map((d) => d.trim()).filter(Boolean);
    const correct = correctLabel(module, item);
    if (module === "GRAFIA" && !/^\p{L}{1,3}$/u.test(item.display.trim())) {
      errors.push(`${n}: informe a letra (ou sílaba de até 3 letras) que será mostrada.`);
    }
    if (module === "MATEMATICA") {
      const ok = (v: number) => Number.isInteger(v) && v >= 0 && v <= 10;
      if (!ok(item.a) || !ok(item.b)) errors.push(`${n}: os números vão de 0 a 10.`);
    }
    if (filled.length < MIN_DISTRACTORS || filled.length > MAX_DISTRACTORS) {
      errors.push(`${n}: informe de ${MIN_DISTRACTORS} a ${MAX_DISTRACTORS} opções erradas.`);
    }
    if (filled.some((d) => d.toLowerCase() === correct)) {
      errors.push(`${n}: uma opção errada é igual à resposta certa (${correct}).`);
    }
    if (new Set(filled.map((d) => d.toLowerCase())).size !== filled.length) {
      errors.push(`${n}: há opções erradas repetidas.`);
    }
  });
  return errors;
}

/** JSON já validado da folha → bloco de apoio no editor. */
export function sheetFromContent(content: unknown): SheetDraft {
  const support = (content as { support?: SheetSupport } | null)?.support;
  return { text: support?.text ?? "", icon: support?.icon ?? "", image: support?.image ?? null, example: support?.example ?? "" };
}

export function validateSheet(sheet: SheetDraft): string[] {
  const errors: string[] = [];
  if (sheet.text.trim().length > MAX_SHEET_TEXT) errors.push(`O texto de leitura pode ter até ${MAX_SHEET_TEXT} letras.`);
  if (sheet.example.trim().length > MAX_EXAMPLE_TEXT) errors.push(`O exemplo pode ter até ${MAX_EXAMPLE_TEXT} letras.`);
  if (sheet.image && sheet.image.alt.trim().length < 3) errors.push("Descreva a imagem da leitura (para quem não enxerga).");
  const marks = sheet.text.split("**").length - 1;
  if (marks % 2 !== 0) errors.push("Um destaque ficou aberto: use **palavra** (dois asteriscos antes e depois).");
  return errors;
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
