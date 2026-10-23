/**
 * Atividade "Escrever o nome": a criança monta o próprio apelido com letras soltas.
 * Uma atividade serve para todos os alunos: o conteúdo guarda só a configuração e o nome
 * vem do aluno (User.displayName) na hora de jogar. O servidor monta as letras e confere cada uma.
 */

export const LETTER_CASES = ["MAIUSCULAS", "COMO_CADASTRADO"] as const;
export type LetterCase = (typeof LETTER_CASES)[number];

export const LETTER_CASE_LABEL: Record<LetterCase, string> = {
  MAIUSCULAS: "Letras maiúsculas (bastão)",
  COMO_CADASTRADO: "Como o apelido está cadastrado",
};

/** Nomes maiores viram cansativos: usa a primeira palavra (ou as primeiras 12 letras). */
export const MAX_NAME_LETTERS = 12;
export const MAX_EXTRA_LETTERS = 6;

export interface NameConfig {
  key: "nome";
  prompt: string;
  /** Letras que não são do nome, misturadas no quadro. */
  extraLetters: number;
  letterCase: LetterCase;
  /** Mostrar o nome inteiro como modelo desde o início (senão ele vira o 1º degrau da dica). */
  showModel: boolean;
}

/** Uma casa do nome: letra a ser colocada, ou separador fixo (espaço/hífen de nome composto). */
export type NameCell = { kind: "letter"; letter: string } | { kind: "gap"; char: string };

export interface NameTile {
  id: string;
  letter: string;
}

export interface NamePlayItem {
  key: "nome";
  prompt: string;
  cells: NameCell[];
  tiles: NameTile[];
  showModel: boolean;
}

const LETTER = /\p{L}/u;
const SEPARATOR = /[\s-]/u;

function applyCase(text: string, letterCase: LetterCase): string {
  return letterCase === "MAIUSCULAS" ? text.toLocaleUpperCase("pt-BR") : text;
}

/** "Ana Clara" → A N A ␣ C L A R A. Números, emojis e pontuação são ignorados. */
export function nameCells(displayName: string, letterCase: LetterCase): NameCell[] {
  let cells: NameCell[] = [];
  let gap: string | null = null;
  for (const ch of [...applyCase(displayName, letterCase)]) {
    if (SEPARATOR.test(ch)) {
      if (cells.length > 0) gap = ch === "-" || gap === "-" ? "-" : " ";
      continue;
    }
    if (!LETTER.test(ch)) continue;
    if (gap) cells.push({ kind: "gap", char: gap });
    gap = null;
    cells.push({ kind: "letter", letter: ch });
  }

  if (letterSlots(cells).length > MAX_NAME_LETTERS) {
    const firstGap = cells.findIndex((c) => c.kind === "gap");
    cells = (firstGap === -1 ? cells : cells.slice(0, firstGap)).slice(0, MAX_NAME_LETTERS);
  }
  return cells;
}

export const letterSlots = (cells: NameCell[]): string[] =>
  cells.flatMap((c) => (c.kind === "letter" ? [c.letter] : []));

/** Chave de telemetria de cada casa: "letra-1", "letra-2"... */
export const slotKey = (index: number) => `letra-${index + 1}`;

/** Id da peça codifica a letra (o servidor confere sem guardar o quadro sorteado): "c65-0" = A. */
export const tileId = (letter: string, n: number) => `c${letter.codePointAt(0)}-${n}`;

export function letterOfTile(id: string): string | null {
  const match = /^c(\d{2,7})-\d{1,3}$/.exec(id);
  if (!match) return null;
  const code = Number(match[1]);
  if (code > 0x10ffff) return null;
  const letter = String.fromCodePoint(code);
  return LETTER.test(letter) ? letter : null;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const base = (c: string) => c.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("pt-BR");

/** Letras extras: só as que NÃO aparecem no nome (nem com acento), para não haver duas respostas certas. */
function extraLetters(slots: string[], count: number, letterCase: LetterCase, random: () => number): string[] {
  const used = new Set(slots.map(base));
  const pool = [...ALPHABET].filter((c) => !used.has(c));
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const [c] = pool.splice(Math.floor(random() * pool.length), 1);
    picked.push(letterCase === "MAIUSCULAS" ? c! : c!.toLocaleLowerCase("pt-BR"));
  }
  return picked;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Monta o quadro do aluno. null se o apelido não tiver nenhuma letra (ex.: "12"). */
export function buildNameItem(
  displayName: string,
  config: NameConfig,
  random: () => number = Math.random,
): NamePlayItem | null {
  const cells = nameCells(displayName, config.letterCase);
  const slots = letterSlots(cells);
  if (slots.length === 0) return null;

  const letters = [...slots, ...extraLetters(slots, config.extraLetters, config.letterCase, random)];
  const tiles = shuffle(letters, random).map((letter, n) => ({ id: tileId(letter, n), letter }));
  return { key: "nome", prompt: config.prompt, cells, tiles, showModel: config.showModel };
}

/**
 * Confere uma letra colocada. true/false = certa/outra; null = tentativa inválida (casa ou peça
 * que não existem). Qualquer peça com a letra certa vale (em "ANA" os dois A servem).
 */
export function checkNameAttempt(
  displayName: string,
  letterCase: LetterCase,
  itemKey: string,
  optionId: string,
): boolean | null {
  const slots = letterSlots(nameCells(displayName, letterCase));
  const match = /^letra-(\d{1,2})$/.exec(itemKey);
  const index = match ? Number(match[1]) - 1 : -1;
  const letter = letterOfTile(optionId);
  if (index < 0 || index >= slots.length || !letter) return null;
  return letter === slots[index];
}
