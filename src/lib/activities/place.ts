import { maxHelp, type AttemptRecord, type HelpLevel } from "@/lib/activities/runner";

/**
 * Motor de ENCAIXAR (peça → casa), comum a todas as atividades de pôr peças no lugar:
 * escrever o nome (letra → casa), completar lacunas (palavra → lacuna), ligar pares (par → item),
 * ordenar (peça → posição), nomear imagens (palavra → figura) e classificar (caixa → cartão da vez).
 *
 * As casas se preenchem em ordem, uma por vez (sempre há uma única "próxima casa"), o que deixa
 * tocar, teclado e arrastar com o mesmo comportamento. A peça vale se o seu `value` for o que a casa
 * espera; peças com o mesmo valor são intercambiáveis (os dois "A" de "ANA").
 * Peça diferente volta para o quadro: não existe "erro", existe "Quase!".
 *
 * Escada de dicas por casa:
 * 1. "contar" (VERBAL_HINT): a dica escrita/falada (ex.: "A próxima letra é S."), se a atividade tiver;
 * 2. destacar a peça certa (VISUAL_HINT).
 */
export interface PlaceSlot {
  /** Chave de telemetria da casa (ex.: "letra-1", "item-2-l1"). */
  key: string;
  /** O valor que a casa aceita. */
  expected: string;
}

export interface PlaceTile {
  id: string;
  value: string;
}

export interface PlaceBoard {
  slots: PlaceSlot[];
  tiles: PlaceTile[];
  /** Há uma dica para "contar" (1º degrau)? Sem ela, a escada vai direto ao destaque. */
  canTell: boolean;
  /** Mostrar o modelo desde o início (ex.: o nome escrito). */
  showModel?: boolean;
  /** Classificar: a mesma peça (a caixa) serve para várias casas (os cartões). */
  reusableTiles?: boolean;
}

export const REDIRECTS_BEFORE_TELL = 2;
export const REDIRECTS_BEFORE_HIGHLIGHT = 3;

export interface PlaceState {
  /** answering = aguardando; placed = acabou de acertar uma casa; redirect = "Quase!"; done = tudo encaixado. */
  status: "answering" | "placed" | "redirect" | "done";
  /** Índice da casa atual. */
  slot: number;
  /** Peças já colocadas, na ordem das casas. */
  placed: string[];
  /** Da casa atual: */
  attempts: number;
  redirects: number;
  help: HelpLevel;
  /** 1º degrau da dica: a dica foi dita. */
  told: boolean;
  /** 2º degrau: a peça certa está em destaque. */
  highlight: boolean;
  /** O modelo aparece (configurado ou depois da 1ª dica; não some mais). */
  modelVisible: boolean;
  shownAt: number;
}

export function initialPlaceState(board: PlaceBoard, now: number): PlaceState {
  return {
    status: "answering",
    slot: 0,
    placed: [],
    attempts: 0,
    redirects: 0,
    help: "NONE",
    told: false,
    highlight: false,
    modelVisible: board.showModel ?? false,
    shownAt: now,
  };
}

export const expectedValue = (board: PlaceBoard, state: PlaceState): string | undefined => board.slots[state.slot]?.expected;

/** A peça que o destaque aponta: a primeira ainda livre com o valor da casa atual. */
export function hintedTile(board: PlaceBoard, state: PlaceState): PlaceTile | undefined {
  const value = expectedValue(board, state);
  return board.tiles.find((t) => t.value === value && (board.reusableTiles || !state.placed.includes(t.id)));
}

/** Coloca uma peça na casa atual. A ajuda registrada é a que a criança JÁ tinha à vista. */
export function placeOnBoard(
  board: PlaceBoard,
  state: PlaceState,
  tileId: string,
  now: number,
): { state: PlaceState; attempt: AttemptRecord | null } {
  const tile = board.tiles.find((t) => t.id === tileId);
  const slot = board.slots[state.slot];
  const used = !board.reusableTiles && state.placed.includes(tileId);
  if (state.status === "done" || !tile || !slot || used) return { state, attempt: null };

  const correct = tile.value === slot.expected;
  const attempt: AttemptRecord = {
    itemKey: slot.key,
    optionId: tileId,
    correct,
    helpLevel: state.help,
    elapsedMs: Math.max(0, Math.round(now - state.shownAt)),
    attemptNo: state.attempts + 1,
  };

  if (correct) {
    const placed = [...state.placed, tileId];
    const done = placed.length === board.slots.length;
    return {
      state: {
        ...state,
        status: done ? "done" : "placed",
        slot: done ? state.slot : state.slot + 1,
        placed,
        attempts: 0,
        redirects: 0,
        help: "NONE",
        told: false,
        highlight: false,
        shownAt: now,
      },
      attempt,
    };
  }

  const redirects = state.redirects + 1;
  // Sem dica para contar, o destaque chega no 2º redirecionamento (onde estaria o 1º degrau).
  const told = board.canTell && (state.told || redirects >= REDIRECTS_BEFORE_TELL);
  const highlight = state.highlight || redirects >= (board.canTell ? REDIRECTS_BEFORE_HIGHLIGHT : REDIRECTS_BEFORE_TELL);
  const help = highlight ? maxHelp(state.help, "VISUAL_HINT") : told ? maxHelp(state.help, "VERBAL_HINT") : state.help;
  return {
    state: {
      ...state,
      status: "redirect",
      attempts: attempt.attemptNo,
      redirects,
      told,
      highlight,
      help,
      modelVisible: state.modelVisible || told,
    },
    attempt,
  };
}

/** Pediu ajuda: conta (e mostra o modelo), depois destaca a peça. Sem dica para contar, destaca. */
export function requestPlaceHint(board: PlaceBoard, state: PlaceState): PlaceState {
  if (state.status === "done") return state;
  const base = state.status === "placed" ? { ...state, status: "answering" as const } : state;
  if (board.canTell && !base.told) {
    return { ...base, told: true, modelVisible: true, help: maxHelp(base.help, "VERBAL_HINT") };
  }
  return { ...base, highlight: true, help: maxHelp(base.help, "VISUAL_HINT") };
}
