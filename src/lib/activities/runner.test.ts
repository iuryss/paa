import type { PlayItem } from "@/lib/validation/activities";
import { answer, hintedOptionIndex, initialItemState, maxHelp, remainingCorrect, requestHint } from "./runner";

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
    expect(state).toMatchObject({ markerHint: false, visualHint: false });
  });

  it("depois de 2 redirecionamentos a dica do marcador aparece, mas só vale para a PRÓXIMA tentativa", () => {
    let s = initialItemState(0);
    s = answer(item, "l-o", s, 100).state;
    const second = answer(item, "l-e", s, 200);
    expect(second.attempt?.helpLevel).toBe("NONE"); // ainda não tinha visto a dica
    expect(second.state).toMatchObject({ markerHint: true, visualHint: false, help: "VISUAL_HINT" });

    const third = answer(item, "l-a", second.state, 300);
    expect(third.attempt).toMatchObject({ correct: true, attemptNo: 3, helpLevel: "VISUAL_HINT" });
  });

  it("no 3º redirecionamento a opção certa também fica destacada", () => {
    let s = initialItemState(0);
    s = answer(item, "l-o", s, 1).state;
    s = answer(item, "l-e", s, 2).state;
    s = answer(item, "l-o", s, 3).state;
    expect(s).toMatchObject({ markerHint: true, visualHint: true, redirects: 3 });
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
  it("1º pedido: dica escrita; 2º: aponta o marcador; 3º: destaca a resposta", () => {
    const first = requestHint(item, initialItemState(0));
    expect(first).toMatchObject({ hintShown: true, markerHint: false, visualHint: false, help: "VERBAL_HINT" });

    const second = requestHint(item, first);
    expect(second).toMatchObject({ markerHint: true, visualHint: false, help: "VISUAL_HINT" });

    const third = requestHint(item, second);
    expect(third).toMatchObject({ markerHint: true, visualHint: true, help: "VISUAL_HINT" });
  });

  it("sem texto de dica, vai direto para a dica do marcador", () => {
    const { hint: _hint, ...noHint } = item;
    void _hint;
    const s = requestHint(noHint, initialItemState(0));
    expect(s).toMatchObject({ markerHint: true, visualHint: false, help: "VISUAL_HINT", hintShown: false });
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

describe("marcar todas as certas", () => {
  const multi: PlayItem = {
    key: "naturais",
    prompt: "Marque os números naturais",
    options: [
      { id: "o-2", label: "2" },
      { id: "o-menos-3", label: "-3" },
      { id: "o-0", label: "0" },
      { id: "o-meio", label: "1/2" },
    ],
    correctId: "o-2",
    correctIds: ["o-2", "o-0"],
    stimulus: { kind: "free" },
  };

  it("cada certa encontrada soma; o passo só termina quando todas aparecem", () => {
    let s = initialItemState(0);
    const first = answer(multi, "o-0", s, 100);
    expect(first.attempt).toMatchObject({ correct: true, attemptNo: 1 });
    expect(first.state).toMatchObject({ status: "partial", found: ["o-0"] });
    expect(remainingCorrect(multi, first.state)).toBe(1);
    s = first.state;

    const again = answer(multi, "o-0", s, 150);
    expect(again.attempt).toBeNull(); // tocar de novo na mesma não conta

    const last = answer(multi, "o-2", s, 200);
    expect(last.state).toMatchObject({ status: "correct", found: ["o-0", "o-2"] });
  });

  it("uma que não vale é 'Quase!' e não apaga as já encontradas", () => {
    const s = answer(multi, "o-0", initialItemState(0), 1).state;
    const r = answer(multi, "o-meio", s, 2);
    expect(r.attempt).toMatchObject({ correct: false });
    expect(r.state).toMatchObject({ status: "redirect", found: ["o-0"] });
  });

  it("pedir dica depois de achar uma certa mostra a dica (e mantém as já encontradas)", () => {
    const partial = answer({ ...multi, hint: "Natural não tem sinal de menos." }, "o-0", initialItemState(0), 1).state;
    const hinted = requestHint({ ...multi, hint: "Natural não tem sinal de menos." }, partial);
    expect(hinted).toMatchObject({ status: "answering", hintShown: true, found: ["o-0"] });
  });

  it("a dica aponta a próxima certa ainda não encontrada", () => {
    let s = initialItemState(0);
    expect(hintedOptionIndex(multi, s)).toBe(0); // o-2
    s = answer(multi, "o-2", s, 1).state;
    expect(hintedOptionIndex(multi, s)).toBe(2); // o-0
  });

  it("na escolha comum, tocar de novo na certa depois de acertar é ignorado", () => {
    const done = answer(item, "l-a", initialItemState(0), 1).state;
    expect(done.found).toEqual(["l-a"]);
    expect(remainingCorrect(item, done)).toBe(0);
  });
});
