import type { PlacePlay, PlayItem } from "@/lib/validation/activities";

/** Fisher–Yates sem alterar o array original. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

function shuffledPlace(place: PlacePlay, random: () => number): PlacePlay {
  if (place.mode === "classificar") {
    const order = shuffled(place.slots.map((_, i) => i), random);
    return {
      ...place,
      slots: order.map((i) => place.slots[i]!),
      cards: order.map((i) => place.cards![i]!),
    };
  }
  let tiles = shuffled(place.tiles, random);
  // Compara valores (não ids): em "BANANA", trocar dois A continuaria na ordem certa.
  const inOrder = () => place.slots.every((slot, i) => tiles[i]?.value === slot.expected);
  for (let tries = 0; place.mode === "ordenar" && inOrder() && tries < 10; tries++) tiles = shuffled(place.tiles, random);
  if (place.mode === "ordenar" && inOrder()) tiles = [...tiles.slice(1), tiles[0]!];
  return { ...place, tiles };
}

/**
 * Embaralha as opções para a resposta certa não ficar sempre na mesma posição.
 * Exceções: o mapa (Localização) mantém a ordem fixa Norte/Sul/Leste/Oeste, porque posições
 * previsíveis ajudam crianças com TEA e a bússola é uma sequência convencional; e itens com
 * `fixedOrder` (Verdadeiro sempre antes de Falso).
 * Encaixar: as peças (banco de palavras, itens da direita) se misturam; as casas ficam em ordem.
 * Classificar é o contrário: as caixas ficam sempre no mesmo lugar e os cartões se misturam.
 * Ordenar nunca começa com as peças já na ordem certa.
 */
export function shuffleItemOptions(items: PlayItem[], random: () => number = Math.random): PlayItem[] {
  return items.map((item) => {
    if (item.place) return { ...item, place: shuffledPlace(item.place, random) };
    return item.stimulus.kind === "map" || item.fixedOrder ? item : { ...item, options: shuffled(item.options, random) };
  });
}
