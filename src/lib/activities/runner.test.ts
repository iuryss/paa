import type { PlayItem } from "@/lib/validation/activities";
import { answer, initialItemState, maxHelp, requestHint } from "./runner";

const item: PlayItem = {
  key: "letra-a",
  prompt: "Qual é a letra a pequena?",
  hint: "A letra pequena parece com a grande.",
  options: [
    { id: "l-a", label: "a" },
    { id: "l-o", label: "o" },
    { id: "l-e", label: "e" },
  ],
  correctId: "l-a",
  stimulus: { kind: "letter", display: "A" },
};

describe("maxHelp", () => {
  it("devolve o maior nível de ajuda", () => {
    expect(maxHelp("NONE", "VERBAL_HINT")).toBe("VERBAL_HINT");
    expect(maxHelp("VISUAL_HINT", "VERBAL_HINT")).toBe("VISUAL_HINT");
    expect(maxHelp("FULL_MODEL", "NONE")).toBe("FULL_MODEL");
  });
});

describe("answer", () => {
  it("acerto de primeira: sem ajuda, tempo medido, tentativa 1", () => {
    const { state, attempt } = answer(item, "l-a", initialItemState(1000), 3500);
    expect(state.status).toBe("correct");
    expect(attempt).toEqual({
      itemKey: "letra-a",
      optionId: "l-a",
      correct: true,
      helpLevel: "NONE",
      elapsedMs: 2500,
      attemptNo: 1,
    });
  });

  it("resposta diferente vira redirecionamento (nunca 'erro') e conta tentativa", () => {
    const { state, attempt } = answer(item, "l-o", initialItemState(0), 1000);
    expect(state.status).toBe("redirect");
    expect(state.redirects).toBe(1);
    expect(attempt).toMatchObject({ correct: false, attemptNo: 1, helpLevel: "NONE" });
    expect(state.visualHint).toBe(false);
  });

  it("depois de 2 redirecionamentos a dica visual aparece, mas só vale para a PRÓXIMA tentativa", () => {
    let s = initialItemState(0);
    s = answer(item, "l-o", s, 100).state;
    const second = answer(item, "l-e", s, 200);
    expect(second.attempt?.helpLevel).toBe("NONE"); // ainda não tinha visto a dica
    expect(second.state.visualHint).toBe(true);
    expect(second.state.help).toBe("VISUAL_HINT");

    const third = answer(item, "l-a", second.state, 300);
    expect(third.attempt).toMatchObject({ correct: true, attemptNo: 3, helpLevel: "VISUAL_HINT" });
  });

  it("depois de acertar, novas respostas são ignoradas", () => {
    const correct = answer(item, "l-a", initialItemState(0), 10).state;
    const again = answer(item, "l-o", correct, 20);
    expect(again.attempt).toBeNull();
    expect(again.state).toBe(correct);
  });

  it("tempo nunca fica negativo", () => {
    const { attempt } = answer(item, "l-a", initialItemState(5000), 4000);
    expect(attempt?.elapsedMs).toBe(0);
  });
});

describe("requestHint", () => {
  it("1º pedido: dica escrita (VERBAL_HINT); 2º: destaca a resposta (VISUAL_HINT)", () => {
    const first = requestHint(item, initialItemState(0));
    expect(first).toMatchObject({ hintShown: true, visualHint: false, help: "VERBAL_HINT" });

    const second = requestHint(item, first);
    expect(second).toMatchObject({ visualHint: true, help: "VISUAL_HINT" });
  });

  it("sem texto de dica, vai direto para a dica visual", () => {
    const { hint: _hint, ...noHint } = item;
    void _hint;
    const s = requestHint(noHint, initialItemState(0));
    expect(s).toMatchObject({ visualHint: true, help: "VISUAL_HINT", hintShown: false });
  });

  it("não rebaixa a ajuda já usada e é ignorado após acertar", () => {
    const visual = answer(item, "l-o", answer(item, "l-e", initialItemState(0), 1).state, 2).state;
    expect(requestHint(item, visual).help).toBe("VISUAL_HINT");
    const done = answer(item, "l-a", initialItemState(0), 1).state;
    expect(requestHint(item, done)).toBe(done);
  });

  it("a ajuda pedida antes aparece na tentativa seguinte", () => {
    const hinted = requestHint(item, initialItemState(0));
    const { attempt } = answer(item, "l-a", hinted, 10);
    expect(attempt?.helpLevel).toBe("VERBAL_HINT");
  });
});
