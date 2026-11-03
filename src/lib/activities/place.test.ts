import { parseActivityContent, judgeAttempt, parseGaps } from "@/lib/validation/activities";
import { hintedTile, initialPlaceState, placeOnBoard, requestPlaceHint, type PlaceBoard } from "./place";

/** Lacunas "A [água] ocupa [espaço]." com uma extra ("fogo"). Duas peças "água" não existem aqui. */
const board: PlaceBoard = {
  slots: [
    { key: "item-1-l1", expected: "água" },
    { key: "item-1-l2", expected: "espaço" },
  ],
  tiles: [
    { id: "w1", value: "água" },
    { id: "w2", value: "espaço" },
    { id: "w3", value: "fogo" },
  ],
  canTell: false,
};

describe("motor de encaixar", () => {
  it("preenche as casas em ordem e termina; registra a chave da casa", () => {
    let s = initialPlaceState(board, 0);
    const first = placeOnBoard(board, s, "w1", 500);
    expect(first.attempt).toMatchObject({ itemKey: "item-1-l1", optionId: "w1", correct: true, elapsedMs: 500 });
    s = first.state;
    expect(placeOnBoard(board, s, "w1", 600).attempt).toBeNull(); // peça já usada
    const last = placeOnBoard(board, s, "w2", 900);
    expect(last.state).toMatchObject({ status: "done", placed: ["w1", "w2"] });
  });

  it("sem dica para contar, o 2º 'Quase!' já destaca a peça (pula o 1º degrau)", () => {
    let s = initialPlaceState(board, 0);
    s = placeOnBoard(board, s, "w3", 1).state;
    expect(s).toMatchObject({ status: "redirect", told: false, highlight: false });
    s = placeOnBoard(board, s, "w3", 2).state;
    expect(s).toMatchObject({ told: false, highlight: true, help: "VISUAL_HINT" });
    expect(hintedTile(board, s)?.id).toBe("w1");
    expect(requestPlaceHint(board, initialPlaceState(board, 0))).toMatchObject({ told: false, highlight: true });
  });

  it("com dica para contar: conta primeiro, depois destaca", () => {
    const tellable = { ...board, canTell: true };
    const first = requestPlaceHint(tellable, initialPlaceState(tellable, 0));
    expect(first).toMatchObject({ told: true, modelVisible: true, highlight: false, help: "VERBAL_HINT" });
    expect(requestPlaceHint(tellable, first)).toMatchObject({ highlight: true, help: "VISUAL_HINT" });
  });
});

describe("parseGaps", () => {
  it("separa o texto e as palavras escondidas, na ordem", () => {
    expect(parseGaps("A [matéria] tem [massa] e [volume].")).toEqual({
      segments: ["A ", null, " tem ", null, " e ", null, "."],
      answers: ["matéria", "massa", "volume"],
    });
    expect(parseGaps("[Fusão] é derreter.")).toEqual({ segments: [null, " é derreter."], answers: ["Fusão"] });
    expect(parseGaps("Sem lacunas.").answers).toEqual([]);
  });
});

describe("folha: lacunas e ligar pares", () => {
  const content = {
    items: [
      {
        type: "lacunas",
        key: "item-1",
        prompt: "Complete a frase",
        text: "A [água] ocupa [espaço] e a [água] molha.",
        extras: ["fogo"],
      },
      {
        type: "ligar",
        key: "item-2",
        prompt: "Ligue o objeto à forma",
        pairs: [
          { id: "p1", left: { label: "Bola" }, right: { label: "Círculo", icon: "circulo" } },
          { id: "p2", left: { label: "Dado" }, right: { label: "Quadrado" } },
        ],
      },
    ],
  };

  it("vira passos de encaixar: lacunas com banco (respostas + extras) e ligar com a coluna da direita", () => {
    const r = parseActivityContent("FOLHA", content);
    if (!r.success) throw new Error("inválido");
    expect(r.items[0]?.place).toEqual({
      mode: "lacunas",
      slots: [
        { key: "item-1-l1", expected: "água" },
        { key: "item-1-l2", expected: "espaço" },
        { key: "item-1-l3", expected: "água" },
      ],
      tiles: [
        { id: "w1", value: "água", label: "água" },
        { id: "w2", value: "espaço", label: "espaço" },
        { id: "w3", value: "água", label: "água" },
        { id: "w4", value: "fogo", label: "fogo" },
      ],
      segments: ["A ", null, " ocupa ", null, " e a ", null, " molha."],
    });
    expect(r.items[1]?.place).toMatchObject({
      mode: "ligar",
      slots: [
        { key: "item-2-p1", expected: "p1" },
        { key: "item-2-p2", expected: "p2" },
      ],
      tiles: [{ id: "p1", label: "Círculo", icon: "circulo" }, { id: "p2", label: "Quadrado" }],
      left: [{ label: "Bola" }, { label: "Dado" }],
    });
  });

  it("judgeAttempt (servidor): qualquer peça com a palavra certa vale; peça ou casa inexistente é inválida", () => {
    const r = parseActivityContent("FOLHA", content);
    if (!r.success) throw new Error("inválido");
    expect(judgeAttempt(r.items, "item-1-l3", "w1")).toBe(true); // a outra "água" também serve
    expect(judgeAttempt(r.items, "item-1-l2", "w4")).toBe(false);
    expect(judgeAttempt(r.items, "item-2-p1", "p1")).toBe(true);
    expect(judgeAttempt(r.items, "item-2-p1", "p2")).toBe(false);
    expect(judgeAttempt(r.items, "item-2-p1", "w1")).toBeNull();
    expect(judgeAttempt(r.items, "item-9-l1", "w1")).toBeNull();
  });

  it("recusa: sem lacunas, extra igual a uma resposta, só um par, pares repetidos", () => {
    const bad = (mutate: (c: typeof content) => void) => {
      const c = JSON.parse(JSON.stringify(content)) as typeof content;
      mutate(c);
      return parseActivityContent("FOLHA", c).success;
    };
    expect(bad((c) => ((c.items[0] as { text: string }).text = "Sem lacunas aqui."))).toBe(false);
    expect(bad((c) => ((c.items[0] as { extras: string[] }).extras = ["Água"]))).toBe(false);
    expect(bad((c) => ((c.items[1] as { pairs: unknown[] }).pairs = (c.items[1] as { pairs: unknown[] }).pairs.slice(0, 1)))).toBe(false);
    expect(
      bad((c) => {
        const pairs = (c.items[1] as { pairs: { right: { label: string } }[] }).pairs;
        pairs[1]!.right.label = "círculo";
      }),
    ).toBe(false);
  });
});
