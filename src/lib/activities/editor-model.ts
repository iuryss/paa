import {
  DIRECTIONS,
  ICON_NAMES,
  type Direction,
  type IconName,
  type SupportedModule,
} from "@/lib/validation/activities";

/**
 * Modelo do editor do professor: um formulário guiado (nunca JSON cru).
 * O professor digita o enunciado e as opções ERRADAS; a resposta certa é derivada do estímulo
 * (letra minúscula, soma, direção), então não há como cadastrar um item sem resposta correta.
 */
export interface EditorItem {
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
};

/** Pictogramas oferecidos para as peças do mapa (as setas de direção ficam de fora). */
export const PIECE_ICONS = ICON_NAMES.filter((n) => !DIRECTIONS.includes(n as Direction));

export const MIN_DISTRACTORS = 1;
export const MAX_DISTRACTORS = 3;
export const MAX_ITEMS = 20;

export function emptyItem(module: SupportedModule): EditorItem {
  const base: EditorItem = {
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
  return base;
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

function buildOptions(prefix: string, correct: string, distractors: string[]) {
  const labels = [correct, ...distractors.map((d) => d.trim()).filter(Boolean)];
  const used = new Set<string>();
  const options = labels.map((label, i) => {
    let id = `${prefix}-${slug(label, i)}`;
    while (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    return { id, label };
  });
  return { options, correctId: options[0]!.id };
}

const optionalHint = (hint: string) => (hint.trim() ? { hint: hint.trim() } : {});

function correctLabel(module: SupportedModule, item: EditorItem): string {
  if (module === "GRAFIA") return item.display.trim().toLowerCase();
  if (module === "MATEMATICA") return String(item.a + item.b);
  return item.position;
}

/** Editor → JSON no formato validado por `contentSchemas`. */
export function toContent(module: SupportedModule, items: EditorItem[]): { items: unknown[] } {
  return {
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

interface StoredItem {
  prompt: string;
  hint?: string;
  options: { id: string; label: string }[];
  correctId: string;
  piece?: { label: string; icon?: IconName };
  position?: Direction;
  display?: string;
  a?: number;
  b?: number;
}

/** JSON já validado → editor (para abrir uma atividade existente). */
export function fromContent(module: SupportedModule, content: unknown): EditorItem[] {
  const items = ((content as { items?: StoredItem[] } | null)?.items ?? []) as StoredItem[];
  return items.map((s) => ({
    ...emptyItem(module),
    prompt: s.prompt,
    hint: s.hint ?? "",
    distractors:
      module === "LOCALIZACAO" ? [] : s.options.filter((o) => o.id !== s.correctId).map((o) => o.label),
    display: s.display ?? "",
    a: s.a ?? 1,
    b: s.b ?? 1,
    pieceLabel: s.piece?.label ?? "",
    pieceIcon: s.piece?.icon ?? "",
    position: s.position ?? "norte",
  }));
}

/**
 * Mensagens em português, item a item, ANTES de chamar a API.
 * (O schema Zod continua sendo a barreira final no servidor.)
 */
export function validateItems(module: SupportedModule, items: EditorItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) errors.push("Adicione pelo menos 1 item.");
  if (items.length > MAX_ITEMS) errors.push(`Use no máximo ${MAX_ITEMS} itens.`);

  items.forEach((item, i) => {
    const n = `Item ${i + 1}`;
    if (!item.prompt.trim()) errors.push(`${n}: escreva a pergunta.`);

    if (module === "LOCALIZACAO") {
      if (!item.pieceLabel.trim()) errors.push(`${n}: dê um nome para a peça (ex.: Escola).`);
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

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
