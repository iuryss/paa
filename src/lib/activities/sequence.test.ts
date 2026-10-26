import { tileId, type NamePlayItem } from "./name";
import { hintTile, initialSequenceState, placeTile, requestSequenceHint } from "./sequence";

/** "ANA" com uma letra extra (B). Os dois A são peças diferentes. */
const item: NamePlayItem = {
  key: "nome",
  prompt: "Escreva seu nome",
  cells: [..."ANA"].map((letter) => ({ kind: "letter" as const, letter })),
  tiles: [
    { id: tileId("N", 0), letter: "N" },
    { id: tileId("A", 1), letter: "A" },
    { id: tileId("B", 2), letter: "B" },
    { id: tileId("A", 3), letter: "A" },
  ],
  showModel: false,
};
const [N, A1, B, A2] = item.tiles.map((t) => t.id) as [string, string, string, string];

describe("placeTile", () => {
  it("monta o nome casa por casa e termina; qualquer A serve em qualquer casa de A", () => {
    let s = initialSequenceState(item, 0);
    const first = placeTile(item, s, A2, 1200);
    expect(first.attempt).toEqual({ itemKey: "letra-1", optionId: A2, correct: true, helpLevel: "NONE", elapsedMs: 1200, attemptNo: 1 });
    s = first.state;
    expect(s).toMatchObject({ status: "placed", slot: 1, placed: [A2] });

    s = placeTile(item, s, N, 2000).state;
    const last = placeTile(item, s, A1, 2600);
    expect(last.attempt).toMatchObject({ itemKey: "letra-3", correct: true, elapsedMs: 600 });
    expect(last.state).toMatchObject({ status: "done", placed: [A2, N, A1] });
  });

  it("letra diferente volta para o quadro (Quase!), sem avançar a casa", () => {
    const { state, attempt } = placeTile(item, initialSequenceState(item, 0), B, 10);
    expect(attempt).toMatchObject({ itemKey: "letra-1", optionId: B, correct: false, attemptNo: 1 });
    expect(state).toMatchObject({ status: "redirect", slot: 0, placed: [], redirects: 1 });
  });

  it("peça já usada, inexistente ou nome completo: nada acontece", () => {
    const s = placeTile(item, initialSequenceState(item, 0), A1, 1).state;
    expect(placeTile(item, s, A1, 2).attempt).toBeNull();
    expect(placeTile(item, s, "c90-9", 2).attempt).toBeNull();
    const done = [N, A2].reduce((st, id) => placeTile(item, st, id, 3).state, s);
    expect(done.status).toBe("done");
    expect(placeTile(item, done, B, 4).attempt).toBeNull();
  });

  it("2 letras diferentes: diz a letra e mostra o modelo; 3: destaca a peça", () => {
    let s = initialSequenceState(item, 0);
    s = placeTile(item, s, B, 1).state;
    const second = placeTile(item, s, N, 2);
    expect(second.attempt?.helpLevel).toBe("NONE"); // a dica vale só para a PRÓXIMA tentativa
    expect(second.state).toMatchObject({ letterHint: true, modelVisible: true, highlight: false, help: "VERBAL_HINT" });

    const third = placeTile(item, second.state, B, 3);
    expect(third.attempt?.helpLevel).toBe("VERBAL_HINT");
    expect(third.state).toMatchObject({ highlight: true, help: "VISUAL_HINT" });

    const ok = placeTile(item, third.state, A1, 4);
    expect(ok.attempt).toMatchObject({ correct: true, helpLevel: "VISUAL_HINT", attemptNo: 4 });
    // A próxima casa começa sem ajuda, mas o modelo continua à vista.
    expect(ok.state).toMatchObject({ help: "NONE", letterHint: false, highlight: false, modelVisible: true });
  });
});

describe("requestSequenceHint e hintTile", () => {
  it("1º pedido: letra + modelo (VERBAL_HINT); 2º: destaque (VISUAL_HINT)", () => {
    const first = requestSequenceHint(initialSequenceState(item, 0));
    expect(first).toMatchObject({ letterHint: true, modelVisible: true, highlight: false, help: "VERBAL_HINT" });
    expect(requestSequenceHint(first)).toMatchObject({ highlight: true, help: "VISUAL_HINT" });
  });

  it("o destaque aponta uma peça livre com a letra da casa atual", () => {
    let s = initialSequenceState(item, 0);
    expect(hintTile(item, s)?.id).toBe(A1);
    s = placeTile(item, s, A1, 1).state;
    expect(hintTile(item, s)?.id).toBe(N);
    s = placeTile(item, s, N, 2).state;
    expect(hintTile(item, s)?.id).toBe(A2); // A1 já foi usado
  });

  it("modelo configurado pelo professor aparece desde o início", () => {
    expect(initialSequenceState({ ...item, showModel: true }, 0).modelVisible).toBe(true);
  });
});
