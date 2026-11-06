import { letterSlots, slotKey, type NamePlayItem, type NameTile } from "@/lib/activities/name";
import {
  expectedValue,
  hintedTile,
  initialPlaceState,
  placeOnBoard,
  REDIRECTS_BEFORE_HIGHLIGHT,
  REDIRECTS_BEFORE_TELL,
  requestPlaceHint,
  type PlaceBoard,
  type PlaceState,
} from "@/lib/activities/place";

/**
 * Montar o nome é o motor de encaixar (`place.ts`) com letras: casa por casa, da esquerda para a direita.
 * Escada de dicas por casa: 1. "A próxima letra é A." e o nome aparece como modelo (VERBAL_HINT);
 * 2. a peça certa fica em destaque (VISUAL_HINT).
 */
export const REDIRECTS_BEFORE_LETTER_HINT = REDIRECTS_BEFORE_TELL;
export const REDIRECTS_BEFORE_TILE_HIGHLIGHT = REDIRECTS_BEFORE_HIGHLIGHT;

export type SequenceState = PlaceState;

/** O nome visto como tabuleiro: uma casa por letra (espaços não contam), as letras soltas como peças. */
export function nameBoard(item: NamePlayItem): PlaceBoard {
  return {
    slots: letterSlots(item.cells).map((letter, i) => ({ key: slotKey(i), expected: letter })),
    tiles: item.tiles.map((t) => ({ id: t.id, value: t.letter })),
    canTell: true, // sempre dá para dizer a próxima letra
    showModel: item.showModel,
  };
}

export const initialSequenceState = (item: NamePlayItem, now: number): SequenceState =>
  initialPlaceState(nameBoard(item), now);

export const expectedLetter = (item: NamePlayItem, state: SequenceState): string | undefined =>
  expectedValue(nameBoard(item), state);

export function hintTile(item: NamePlayItem, state: SequenceState): NameTile | undefined {
  const tile = hintedTile(nameBoard(item), state);
  return item.tiles.find((t) => t.id === tile?.id);
}

export const placeTile = (item: NamePlayItem, state: SequenceState, tileId: string, now: number) =>
  placeOnBoard(nameBoard(item), state, tileId, now);

export const requestSequenceHint = (item: NamePlayItem, state: SequenceState): SequenceState =>
  requestPlaceHint(nameBoard(item), state);
