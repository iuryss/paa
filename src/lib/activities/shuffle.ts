import type { PlayItem } from "@/lib/validation/activities";

/** Fisher–Yates sem alterar o array original. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/**
 * Embaralha as opções para a resposta certa não ficar sempre na mesma posição.
 * Exceções: o mapa (Localização) mantém a ordem fixa Norte/Sul/Leste/Oeste, porque posições
 * previsíveis ajudam crianças com TEA e a bússola é uma sequência convencional; e itens com
 * `fixedOrder` (Verdadeiro sempre antes de Falso).
 */
export function shuffleItemOptions(items: PlayItem[], random: () => number = Math.random): PlayItem[] {
  return items.map((item) =>
    item.stimulus.kind === "map" || item.fixedOrder ? item : { ...item, options: shuffled(item.options, random) },
  );
}
