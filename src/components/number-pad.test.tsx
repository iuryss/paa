import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { judgeAttempt, parseActivityContent, parseMarkedWords } from "@/lib/validation/activities";
import { AccessibilityProvider } from "./accessibility-provider";
import { ActivityRunner } from "./activity-runner";

function setup(exercise: Record<string, unknown>) {
  const r = parseActivityContent("FOLHA", { items: [{ key: "item-1", prompt: "Faça", ...exercise }] });
  if (!r.success) throw new Error("inválido");
  const onRecord = jest.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <AccessibilityProvider initial={DEFAULT_PREFERENCES}>
      <ActivityRunner
        activityId="act-123456"
        title="Teste"
        items={r.items}
        onStart={jest.fn().mockResolvedValue({ ok: true, sessionId: "s1" })}
        onRecord={onRecord}
        onFinish={jest.fn().mockResolvedValue({ ok: true })}
      />
    </AccessibilityProvider>,
  );
  return { onRecord, ...utils };
}

const keypad = () => within(screen.getByRole("group", { name: "Teclado de números" }));
const answerBox = () => screen.getByLabelText("Sua resposta");
async function typeKeys(user: ReturnType<typeof userEvent.setup>, keys: string[]) {
  for (const key of keys) await user.click(keypad().getByRole("button", { name: key }));
}

describe("Folha — resposta em número", () => {
  const numero = {
    type: "numero",
    hint: "Multiplique o 2 três vezes.",
    questions: [
      { id: "q1", expression: "2^3", answer: "8" },
      { id: "q2", expression: "1/2 + 1/2", answer: "1" },
      { id: "q3", expression: "2^-1", answer: "1/2" },
    ],
  };

  it("uma conta por vez, no teclado da tela; a resposta diferente é 'Quase!' e o campo limpa", async () => {
    const { onRecord, container } = setup(numero);
    const user = userEvent.setup();
    expect(screen.getByText("Exercício 1 de 1 · Conta 1 de 3")).toBeInTheDocument();
    expect(screen.getByText("2 elevado a 3")).toBeInTheDocument(); // o que o leitor de tela ouve
    expect(container.querySelector("sup")).toHaveTextContent("3"); // o que a tela mostra

    await typeKeys(user, ["6"]);
    expect(answerBox()).toHaveValue("6");
    await user.click(screen.getByRole("button", { name: "Pronto" }));
    expect(screen.getByRole("status")).toHaveTextContent("Quase!");
    expect(answerBox()).toHaveValue("");

    await typeKeys(user, ["8"]);
    await user.click(screen.getByRole("button", { name: "Pronto" }));
    expect(screen.getByRole("status")).toHaveTextContent("A resposta é 8.");
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Teclado de números" })).not.toBeInTheDocument();

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));
    expect(onRecord.mock.calls.map((c) => [c[1].itemKey, c[1].optionId])).toEqual([
      ["item-1-q1", "n-6"],
      ["item-1-q1", "n-8"],
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("resposta equivalente vale (0,5 = 1/2), com menos, vírgula, barra e apagar", async () => {
    setup({ type: "numero", questions: [{ id: "q1", expression: "2^-1", answer: "1/2" }] });
    const user = userEvent.setup();
    await typeKeys(user, ["0", "vírgula", "5", "5"]);
    await user.click(screen.getByRole("button", { name: "Apagar" }));
    expect(answerBox()).toHaveValue("0,5");
    await user.click(screen.getByRole("button", { name: "Pronto" }));
    expect(screen.getByRole("status")).toHaveTextContent("A resposta é 1/2.");
  });

  it("não conta tentativa se não for um número; teclado físico digita no campo e Enter confirma", async () => {
    const { onRecord } = setup({ type: "numero", questions: [{ id: "q1", expression: "5 - 8", answer: "-3" }] });
    const user = userEvent.setup();
    await typeKeys(user, ["menos"]);
    await user.click(screen.getByRole("button", { name: "Pronto" }));
    expect(screen.getByText(/Digite um número/)).toBeInTheDocument();
    expect(onRecord).not.toHaveBeenCalled();

    await user.click(answerBox());
    await user.keyboard("3abc{Enter}");
    expect(answerBox()).toHaveValue("-3");
    expect(screen.getByRole("status")).toHaveTextContent("A resposta é -3.");
  });

  it("a dica é a do professor e depois a resposta; 2 tentativas diferentes já mostram a resposta", async () => {
    const { onRecord } = setup(numero);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getByRole("status")).toHaveTextContent("Multiplique o 2 três vezes.");
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getByRole("status")).toHaveTextContent("A resposta é 8.");
    await typeKeys(user, ["8"]);
    await user.click(screen.getByRole("button", { name: "Pronto" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    expect(onRecord.mock.calls[0]?.[1]).toMatchObject({ helpLevel: "VISUAL_HINT" });
  });

  it("o servidor confere: equivalentes valem, resposta inválida não", () => {
    const r = parseActivityContent("FOLHA", { items: [{ key: "item-1", prompt: "F", ...numero }] });
    if (!r.success) throw new Error("inválido");
    expect(judgeAttempt(r.items, "item-1-q3", "n-0c5")).toBe(true);
    expect(judgeAttempt(r.items, "item-1-q3", "n-2s4")).toBe(true);
    expect(judgeAttempt(r.items, "item-1-q1", "n-9")).toBe(false);
    expect(judgeAttempt(r.items, "item-1-q1", "o-gato")).toBeNull();
    expect(
      parseActivityContent("FOLHA", { items: [{ key: "item-1", prompt: "F", type: "numero", questions: [{ id: "q1", expression: "x", answer: "oito" }] }] }).success,
    ).toBe(false);
  });
});

describe("Folha — marcar no texto", () => {
  const marcar = { type: "marcartexto", hint: "São estados da água.", text: "O [gelo] e o [vapor], juntos com a água." };

  it("parseMarkedWords: os colchetes marcam as certas; pontuação fica colada; frase em colchete é uma peça só", () => {
    expect(parseMarkedWords("O [gelo], e [água líquida].")).toEqual([
      { label: "O", correct: false },
      { label: "gelo,", correct: true },
      { label: "e", correct: false },
      { label: "água líquida.", correct: true },
    ]);
  });

  it("toca as palavras certas; a errada é 'Quase!' e não desmarca as encontradas; texto na ordem", async () => {
    const { onRecord, container } = setup(marcar);
    const user = userEvent.setup();
    const words = () => within(screen.getByRole("group", { name: "Palavras do texto" }));
    expect(words().getAllByRole("button").map((b) => b.textContent)).toEqual(["O", "gelo", "e", "o", "vapor,", "juntos", "com", "a", "água."]);
    expect(screen.getByText("Toque nas palavras certas: 0 de 2.")).toBeInTheDocument();
    expect(container.querySelector("[data-marker]")).toBeNull(); // sem marcadores de cor/forma

    await user.click(words().getByRole("button", { name: "gelo" }));
    expect(words().getByRole("button", { name: "gelo" })).toHaveAttribute("aria-pressed", "true");
    await user.click(words().getByRole("button", { name: "juntos" }));
    expect(screen.getByRole("status")).toHaveTextContent("Quase!");
    await user.click(words().getByRole("button", { name: "vapor," }));
    expect(screen.getByRole("status")).toHaveTextContent("Você achou todas!");
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(3));
    expect(onRecord.mock.calls.map((c) => c[1].optionId)).toEqual(["w2", "w6", "w5"]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("a dica é a do professor e depois a palavra em destaque, sem passar pelo marcador", async () => {
    setup(marcar);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getByRole("status")).toHaveTextContent("São estados da água.");
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getByRole("status")).toHaveTextContent("Toque em “gelo”, que está em destaque.");
    expect(screen.getByRole("button", { name: "gelo. Dica: esta palavra" })).toBeInTheDocument();
  });

  it("recusa texto sem palavra certa ou com todas certas", () => {
    const bad = (text: string) =>
      parseActivityContent("FOLHA", { items: [{ key: "item-1", prompt: "F", type: "marcartexto", text }] }).success;
    expect(bad("Nenhuma marcada aqui.")).toBe(false);
    expect(bad("[Todas] [marcadas]")).toBe(false);
  });
});

describe("notação matemática na tela", () => {
  it("fração e raiz nas respostas: o nome acessível é falado", () => {
    setup({
      type: "escolha",
      options: [
        { id: "o-meio", label: "1/2" },
        { id: "o-raiz", label: "raiz(9)" },
      ],
      correctId: "o-meio",
    });
    expect(screen.getByRole("button", { name: /^1 sobre 2, / })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^raiz de 9, / })).toHaveTextContent("√9");
  });
});
