import type { PlayItem } from "@/lib/validation/activities";
import { shuffled, shuffleItemOptions } from "./shuffle";

const letter: PlayItem = {
  key: "letra-a",
  prompt: "Qual letra?",
  options: [
    { id: "l-a", label: "a" },
    { id: "l-o", label: "o" },
    { id: "l-e", label: "e" },
  ],
  correctId: "l-a",
  stimulus: { kind: "letter", display: "A" },
};

const map: PlayItem = {
  key: "escola-norte",
  prompt: "Onde fica a escola?",
  options: ["norte", "sul", "leste", "oeste"].map((id) => ({ id, label: id })),
  correctId: "norte",
  stimulus: { kind: "map", piece: { label: "Escola" }, position: "norte" },
};

/** Gerador pseudoaleatório determinístico (mulberry32) para testes repetíveis. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("shuffled", () => {
  it("mantém os mesmos elementos e não altera o original", () => {
    const original = [1, 2, 3, 4, 5];
    const out = shuffled(original, seeded(1));
    expect([...out].sort()).toEqual(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("shuffleItemOptions", () => {
  it("a resposta certa deixa de ficar sempre na primeira posição", () => {
    const firstPositions = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const [item] = shuffleItemOptions([letter], seeded(seed));
      firstPositions.add(item!.options.findIndex((o) => o.id === item!.correctId));
    }
    expect(firstPositions).toEqual(new Set([0, 1, 2])); // aparece em todas as posições
  });

  it("não perde nem duplica opções, e a resposta certa continua existindo", () => {
    const [item] = shuffleItemOptions([letter], seeded(7));
    expect(item!.options.map((o) => o.id).sort()).toEqual(["l-a", "l-e", "l-o"]);
    expect(item!.correctId).toBe("l-a");
  });

  it("o mapa mantém a ordem fixa Norte/Sul/Leste/Oeste", () => {
    for (let seed = 0; seed < 20; seed++) {
      const [item] = shuffleItemOptions([map], seeded(seed));
      expect(item!.options.map((o) => o.id)).toEqual(["norte", "sul", "leste", "oeste"]);
    }
  });

  it("não altera os itens originais", () => {
    const before = JSON.stringify(letter);
    shuffleItemOptions([letter], seeded(3));
    expect(JSON.stringify(letter)).toBe(before);
  });
});
