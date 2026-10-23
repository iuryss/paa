import type { PlayItem } from "@/lib/validation/activities";

export type HelpLevel = "NONE" | "VERBAL_HINT" | "VISUAL_HINT" | "FULL_MODEL";

const HELP_ORDER: readonly HelpLevel[] = ["NONE", "VERBAL_HINT", "VISUAL_HINT", "FULL_MODEL"];

export function maxHelp(a: HelpLevel, b: HelpLevel): HelpLevel {
  return HELP_ORDER.indexOf(a) >= HELP_ORDER.indexOf(b) ? a : b;
}

/**
 * Escada de dicas (cada degrau só aparece depois do anterior):
 * 1. dica escrita do professor (VERBAL_HINT), se houver;
 * 2. dica do marcador: "Procure o triângulo amarelo" (VISUAL_HINT);
 * 3. destaque: a opção certa fica marcada na tela (VISUAL_HINT).
 * Redirecionamentos seguidos também sobem a escada sozinhos.
 */
export const REDIRECTS_BEFORE_MARKER_HINT = 2;
export const REDIRECTS_BEFORE_HIGHLIGHT = 3;

export interface ItemState {
  /** answering = aguardando; correct = acertou; redirect = convite para tentar de novo. Não existe "erro". */
  status: "answering" | "correct" | "redirect";
  /** Tentativas já feitas neste item. */
  attempts: number;
  redirects: number;
  help: HelpLevel;
  hintShown: boolean;
  /** A dica aponta o marcador (cor/forma) da resposta certa. */
  markerHint: boolean;
  /** A opção certa fica destacada na tela. */
  visualHint: boolean;
  shownAt: number;
}

export interface AttemptRecord {
  itemKey: string;
  optionId: string;
  correct: boolean;
  helpLevel: HelpLevel;
  elapsedMs: number;
  attemptNo: number;
}

export function initialItemState(now: number): ItemState {
  return {
    status: "answering",
    attempts: 0,
    redirects: 0,
    help: "NONE",
    hintShown: false,
    markerHint: false,
    visualHint: false,
    shownAt: now,
  };
}

/**
 * Processa uma resposta. A ajuda registrada na tentativa é a que a criança JÁ tinha à vista;
 * a escalada causada por esta resposta vale só para a próxima tentativa.
 * Depois de acertar, novas respostas são ignoradas (attempt = null).
 */
export function answer(
  item: PlayItem,
  optionId: string,
  state: ItemState,
  now: number,
): { state: ItemState; attempt: AttemptRecord | null } {
  if (state.status === "correct") return { state, attempt: null };

  const correct = optionId === item.correctId;
  const attempt: AttemptRecord = {
    itemKey: item.key,
    optionId,
    correct,
    helpLevel: state.help,
    elapsedMs: Math.max(0, Math.round(now - state.shownAt)),
    attemptNo: state.attempts + 1,
  };

  if (correct) {
    return { state: { ...state, status: "correct", attempts: attempt.attemptNo }, attempt };
  }

  const redirects = state.redirects + 1;
  const markerHint = state.markerHint || redirects >= REDIRECTS_BEFORE_MARKER_HINT;
  const visualHint = state.visualHint || redirects >= REDIRECTS_BEFORE_HIGHLIGHT;
  return {
    state: {
      ...state,
      status: "redirect",
      attempts: attempt.attemptNo,
      redirects,
      markerHint,
      visualHint,
      help: markerHint ? maxHelp(state.help, "VISUAL_HINT") : state.help,
    },
    attempt,
  };
}

/** Criança pediu ajuda: sobe um degrau da escada (dica escrita → marcador → destaque). */
export function requestHint(item: PlayItem, state: ItemState): ItemState {
  if (state.status === "correct") return state;
  if (!state.hintShown && item.hint) {
    return { ...state, hintShown: true, help: maxHelp(state.help, "VERBAL_HINT") };
  }
  if (!state.markerHint) {
    return { ...state, markerHint: true, help: maxHelp(state.help, "VISUAL_HINT") };
  }
  return { ...state, visualHint: true, help: maxHelp(state.help, "VISUAL_HINT") };
}
