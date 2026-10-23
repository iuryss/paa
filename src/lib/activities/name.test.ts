import {
  buildNameItem,
  checkNameAttempt,
  letterOfTile,
  letterSlots,
  nameCells,
  tileId,
  type NameConfig,
} from "./name";

const config: NameConfig = { key: "nome", prompt: "Escreva seu nome", extraLetters: 3, letterCase: "MAIUSCULAS", showModel: false };

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

describe("nameCells", () => {
  it("maiúsculas (bastão) ou como está no cadastro", () => {
    expect(letterSlots(nameCells("Sol", "MAIUSCULAS"))).toEqual(["S", "O", "L"]);
    expect(letterSlots(nameCells("Sol", "COMO_CADASTRADO"))).toEqual(["S", "o", "l"]);
  });

  it("acentos e Ç são letras de verdade", () => {
    expect(letterSlots(nameCells("Íris", "MAIUSCULAS"))).toEqual(["Í", "R", "I", "S"]);
    expect(letterSlots(nameCells("Conceição", "COMO_CADASTRADO"))).toEqual([..."Conceição"]);
  });

  it("nome composto: espaço e hífen viram casas fixas (sem letra para colocar)", () => {
    expect(nameCells("Ana Clara", "MAIUSCULAS")).toEqual([
      ..."ANA".split("").map((letter) => ({ kind: "letter", letter })),
      { kind: "gap", char: " " },
      ..."CLARA".split("").map((letter) => ({ kind: "letter", letter })),
    ]);
    expect(nameCells("Ana-Lu", "MAIUSCULAS").filter((c) => c.kind === "gap")).toEqual([{ kind: "gap", char: "-" }]);
  });

  it("ignora números, emojis, pontuação e espaços nas pontas", () => {
    expect(letterSlots(nameCells("  Léo 2 ⭐ ", "MAIUSCULAS"))).toEqual(["L", "É", "O"]);
    expect(nameCells("  Léo 2 ⭐ ", "MAIUSCULAS").some((c) => c.kind === "gap")).toBe(false);
    expect(nameCells("12", "MAIUSCULAS")).toEqual([]);
  });

  it("nome longo: fica a primeira palavra; palavra longa: as 12 primeiras letras", () => {
    expect(letterSlots(nameCells("Maria Eduarda Souza", "MAIUSCULAS"))).toEqual([..."MARIA"]);
    expect(letterSlots(nameCells("Maximilianoooo", "MAIUSCULAS"))).toHaveLength(12);
  });
});

describe("tileId / letterOfTile", () => {
  it("a peça carrega a letra (ida e volta), com acento", () => {
    for (const letter of ["A", "a", "Ç", "Í"]) expect(letterOfTile(tileId(letter, 7))).toBe(letter);
  });

  it("recusa ids que não são de letra", () => {
    expect(letterOfTile("c49-0")).toBeNull(); // "1"
    expect(letterOfTile("c9999999-0")).toBeNull();
    expect(letterOfTile("o-gato")).toBeNull();
  });
});

describe("buildNameItem", () => {
  it("o quadro tem as letras do nome + as extras, embaralhadas", () => {
    const item = buildNameItem("Sol", config, seeded(1))!;
    expect(item.tiles).toHaveLength(6);
    const letters = item.tiles.map((t) => t.letter);
    for (const c of ["S", "O", "L"]) expect(letters).toContain(c);
    expect(new Set(item.tiles.map((t) => t.id)).size).toBe(6);
  });

  it("letras extras nunca repetem letras do nome (nem com acento)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const item = buildNameItem("Íris", { ...config, extraLetters: 6 }, seeded(seed))!;
      const extras = item.tiles.map((t) => t.letter).filter((l) => !["Í", "R", "I", "S"].includes(l));
      expect(extras).toHaveLength(6);
      expect(extras.some((l) => ["I", "R", "S"].includes(l))).toBe(false);
    }
  });

  it("no modo 'como cadastrado' as extras são minúsculas", () => {
    const item = buildNameItem("Sol", { ...config, letterCase: "COMO_CADASTRADO" }, seeded(2))!;
    const extras = item.tiles.map((t) => t.letter).filter((l) => !["S", "o", "l"].includes(l));
    expect(extras.every((l) => l === l.toLowerCase())).toBe(true);
  });

  it("a ordem muda entre sorteios", () => {
    const orders = new Set([1, 2, 3, 4, 5].map((s) => buildNameItem("Sol", config, seeded(s))!.tiles.map((t) => t.letter).join("")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("apelido sem letras: não há atividade para montar", () => {
    expect(buildNameItem("12", config)).toBeNull();
  });
});

describe("checkNameAttempt (o servidor confere)", () => {
  it("certo é a letra daquela casa; qualquer peça com a mesma letra vale", () => {
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-1", tileId("A", 4))).toBe(true);
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-3", tileId("A", 0))).toBe(true);
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-2", tileId("A", 0))).toBe(false);
  });

  it("maiúscula e minúscula contam como letras diferentes", () => {
    expect(checkNameAttempt("Ana", "COMO_CADASTRADO", "letra-2", tileId("N", 0))).toBe(false);
    expect(checkNameAttempt("Ana", "COMO_CADASTRADO", "letra-2", tileId("n", 0))).toBe(true);
  });

  it("casa ou peça inexistente é tentativa inválida (null)", () => {
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-4", tileId("A", 0))).toBeNull();
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-0", tileId("A", 0))).toBeNull();
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "item-1", tileId("A", 0))).toBeNull();
    expect(checkNameAttempt("Ana", "MAIUSCULAS", "letra-1", "o-gato")).toBeNull();
  });

  it("nome composto: as casas contam só letras (o espaço não é casa)", () => {
    expect(checkNameAttempt("Ana Lu", "MAIUSCULAS", "letra-4", tileId("L", 0))).toBe(true);
  });
});
