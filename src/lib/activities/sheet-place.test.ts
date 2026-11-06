import { judgeAttempt, parseActivityContent, type PlacePlay, type PlayItem } from "@/lib/validation/activities";
import { shuffleItemOptions } from "./shuffle";

const content = {
  items: [
    { type: "ordenar", key: "item-1", prompt: "Organize as letras", order: "letras", pieces: ["Á", "G", "U", "A"] },
    {
      type: "nomear",
      key: "item-2",
      prompt: "Escreva o nome de cada figura",
      figures: [
        { icon: "gato", answer: "Gato" },
        { image: { id: "cimgbola1234567890abcdef", alt: "Uma bola" }, answer: "Bola" },
      ],
      extras: ["Sol"],
    },
    {
      type: "classificar",
      key: "item-3",
      prompt: "Separe nas caixas",
      groups: [
        { id: "g1", label: "Físico" },
        { id: "g2", label: "Químico" },
      ],
      cards: [
        { id: "c1", label: "Gelo derretendo", group: "g1" },
        { id: "c2", label: "Ferrugem", group: "g2" },
        { id: "c3", label: "Papel amassado", group: "g1" },
      ],
    },
  ],
};

function parsed(): PlayItem[] {
  const r = parseActivityContent("FOLHA", content);
  if (!r.success) throw new Error("inválido");
  return r.items;
}

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

describe("folha: ordenar, nomear e classificar viram passos de encaixar", () => {
  it("ordenar: uma casa por posição; a ordem certa é a do professor", () => {
    expect(parsed()[0]?.place).toMatchObject({
      mode: "ordenar",
      order: "letras",
      slots: [{ key: "item-1-o1", expected: "á" }, { key: "item-1-o2", expected: "g" }, {}, { key: "item-1-o4", expected: "a" }],
      tiles: [{ id: "t1", label: "Á" }, { id: "t2", label: "G" }, { id: "t3", label: "U" }, { id: "t4", label: "A" }],
    });
  });

  it("nomear: a figura vai para a tela sem a resposta; o banco leva respostas + extras", () => {
    const place = parsed()[1]?.place as PlacePlay;
    expect(place.figures).toEqual([{ icon: "gato" }, { image: { id: "cimgbola1234567890abcdef", alt: "Uma bola" } }]);
    expect(place.tiles.map((t) => t.label)).toEqual(["Gato", "Bola", "Sol"]);
    expect(place.slots.map((sl) => sl.key)).toEqual(["item-2-n1", "item-2-n2"]);
  });

  it("classificar: um cartão por casa; as peças são as caixas", () => {
    const place = parsed()[2]?.place as PlacePlay;
    expect(place.cards?.map((c) => c.label)).toEqual(["Gelo derretendo", "Ferrugem", "Papel amassado"]);
    expect(place.tiles.map((t) => t.id)).toEqual(["g1", "g2"]);
    expect(place.slots.map((sl) => sl.expected)).toEqual(["g1", "g2", "g1"]);
  });

  it("o servidor confere: posição, nome e caixa", () => {
    const items = parsed();
    expect(judgeAttempt(items, "item-1-o2", "t2")).toBe(true);
    expect(judgeAttempt(items, "item-1-o2", "t1")).toBe(false);
    expect(judgeAttempt(items, "item-2-n1", "w1")).toBe(true);
    expect(judgeAttempt(items, "item-2-n1", "w3")).toBe(false);
    expect(judgeAttempt(items, "item-3-c3", "g1")).toBe(true);
    expect(judgeAttempt(items, "item-3-c3", "g2")).toBe(false);
    expect(judgeAttempt(items, "item-3-c9", "g1")).toBeNull();
  });
});

describe("recusa conteúdo incoerente", () => {
  const change = (mutate: (items: Record<string, unknown>[]) => void) => {
    const c = JSON.parse(JSON.stringify(content)) as { items: Record<string, unknown>[] };
    mutate(c.items);
    return parseActivityContent("FOLHA", c).success;
  };

  it("ordenar: peça com mais de uma letra no modo letras, ou todas iguais", () => {
    expect(change((i) => (i[0]!.pieces = ["AB", "C"]))).toBe(false);
    expect(change((i) => (i[0]!.pieces = ["a", "A"]))).toBe(false);
  });

  it("nomear: sem figura, ou extra igual a uma resposta", () => {
    expect(change((i) => (i[1]!.figures = [{ answer: "Gato" }, { icon: "sol", answer: "Sol" }]))).toBe(false);
    expect(change((i) => (i[1]!.extras = ["gato"]))).toBe(false);
  });

  it("classificar: cartão em caixa inexistente, ou caixa vazia", () => {
    expect(change((i) => ((i[2]!.cards as { group: string }[])[0]!.group = "g9"))).toBe(false);
    expect(change((i) => (i[2]!.cards = [{ id: "c1", label: "A", group: "g1" }, { id: "c2", label: "B", group: "g1" }]))).toBe(false);
  });
});

describe("embaralhamento", () => {
  it("ordenar nunca começa na ordem certa (mesmo com letras repetidas)", () => {
    const r = parseActivityContent("FOLHA", {
      items: [{ type: "ordenar", key: "item-1", prompt: "Organize", order: "letras", pieces: ["A", "B"] }],
    });
    if (!r.success) throw new Error("inválido");
    for (let seed = 0; seed < 40; seed++) {
      const place = shuffleItemOptions(r.items, seeded(seed))[0]!.place!;
      expect(place.tiles.map((t) => t.value).join("")).toBe("ba");
    }
  });

  it("classificar: os cartões se misturam junto com as casas; as caixas não saem do lugar", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const place = shuffleItemOptions(parsed(), seeded(seed))[2]!.place!;
      expect(place.tiles.map((t) => t.id)).toEqual(["g1", "g2"]);
      // Cada cartão continua ligado à sua casa (e à sua caixa certa).
      expect(place.cards!.map((c, i) => [c.label, place.slots[i]!.expected]).sort()).toEqual([
        ["Ferrugem", "g2"],
        ["Gelo derretendo", "g1"],
        ["Papel amassado", "g1"],
      ]);
      orders.add(place.cards!.map((c) => c.label).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});
