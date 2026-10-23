import { letterSlots, slotKey, type NamePlayItem, type NameTile } from "@/lib/activities/name";
import { maxHelp, type AttemptRecord, type HelpLevel } from "@/lib/activities/runner";

/**
 * Montar o nome, casa por casa, da esquerda para a direita (sempre há uma única "próxima casa",
 * o que deixa tocar, teclado e arrastar com o mesmo comportamento).
 * Escada de dicas por casa, como nos outros módulos:
 * 1. "A próxima letra é A." e o nome aparece como modelo (VERBAL_HINT);
 * 2. a peça certa fica em destaque (VISUAL_HINT).
 * Letra diferente volta para o quadro: não existe "erro", existe "Quase!".
 */
export const REDIRECTS_BEFORE_LETTER_HINT = 2;
export const REDIRECTS_BEFORE_TILE_HIGHLIGHT = 3;

export interface SequenceState {
  /** answering = aguardando; placed = acabou de acertar uma casa; redirect = "Quase!"; done = nome completo. */
  status: "answering" | "placed" | "redirect" | "done";
  /** Índice da casa atual entre as casas de letra (espaços não contam). */
  slot: number;
  /** Peças já colocadas, na ordem das casas. */
  placed: string[];
  /** Da casa atual: */
  attempts: number;
  redirects: number;
  help: HelpLevel;
  letterHint: boolean;
  highlight: boolean;
  /** O nome-modelo aparece (configurado pelo professor ou depois da 1ª dica; não some mais). */
  modelVisible: boolean;
  shownAt: number;
}

export function initialSequenceState(item: NamePlayItem, now: number): SequenceState {
  return {
    status: "answering",
    slot: 0,
    placed: [],
    attempts: 0,
    redirects: 0,
    help: "NONE",
    letterHint: false,
    highlight: false,
    modelVisible: item.showModel,
    shownAt: now,
  };
}

export const expectedLetter = (item: NamePlayItem, state: SequenceState): string | undefined =>
  letterSlots(item.cells)[state.slot];

/** A peça que a dica destaca: a primeira ainda livre com a letra da casa atual. */
export function hintTile(item: NamePlayItem, state: SequenceState): NameTile | undefined {
  const letter = expectedLetter(item, state);
  return item.tiles.find((t) => t.letter === letter && !state.placed.includes(t.id));
}

/**
 * Coloca uma peça na casa atual. A ajuda registrada é a que a criança JÁ tinha à vista.
 * Peça já usada, inexistente ou nome completo: nada acontece (attempt = null).
 */
export function placeTile(
  item: NamePlayItem,
  state: SequenceState,
  tileId: string,
  now: number,
): { state: SequenceState; attempt: AttemptRecord | null } {
  const tile = item.tiles.find((t) => t.id === tileId);
  if (state.status === "done" || !tile || state.placed.includes(tileId)) return { state, attempt: null };

  const correct = tile.letter === expectedLetter(item, state);
  const attempt: AttemptRecord = {
    itemKey: slotKey(state.slot),
    optionId: tileId,
    correct,
    helpLevel: state.help,
    elapsedMs: Math.max(0, Math.round(now - state.shownAt)),
    attemptNo: state.attempts + 1,
  };

  if (correct) {
    const placed = [...state.placed, tileId];
    const done = placed.length === letterSlots(item.cells).length;
    return {
      state: {
        ...state,
        status: done ? "done" : "placed",
        slot: done ? state.slot : state.slot + 1,
        placed,
        attempts: 0,
        redirects: 0,
        help: "NONE",
        letterHint: false,
        highlight: false,
        shownAt: now,
      },
      attempt,
    };
  }

  const redirects = state.redirects + 1;
  const letterHint = state.letterHint || redirects >= REDIRECTS_BEFORE_LETTER_HINT;
  const highlight = state.highlight || redirects >= REDIRECTS_BEFORE_TILE_HIGHLIGHT;
  const help = highlight ? maxHelp(state.help, "VISUAL_HINT") : letterHint ? maxHelp(state.help, "VERBAL_HINT") : state.help;
  return {
    state: {
      ...state,
      status: "redirect",
      attempts: attempt.attemptNo,
      redirects,
      letterHint,
      highlight,
      help,
      modelVisible: state.modelVisible || letterHint,
    },
    attempt,
  };
}

/** Criança pediu ajuda: diz a letra (e mostra o modelo); depois destaca a peça. */
export function requestSequenceHint(state: SequenceState): SequenceState {
  if (state.status === "done") return state;
  if (!state.letterHint) {
    return { ...state, letterHint: true, modelVisible: true, help: maxHelp(state.help, "VERBAL_HINT") };
  }
  return { ...state, highlight: true, help: maxHelp(state.help, "VISUAL_HINT") };
}
