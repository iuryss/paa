import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { tileId, type NamePlayItem } from "@/lib/activities/name";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { AccessibilityProvider } from "./accessibility-provider";
import { NameRunner } from "./name-runner";

/** "ANA" + B extra. Ordem do quadro: N, A, B, A. */
const ana: NamePlayItem = {
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

function setup(item: NamePlayItem = ana) {
  let clock = 1000;
  const onStart = jest.fn().mockResolvedValue({ ok: true, sessionId: "sess-1" });
  const onRecord = jest.fn().mockResolvedValue({ ok: true });
  const onFinish = jest.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <AccessibilityProvider initial={DEFAULT_PREFERENCES}>
      <NameRunner
        activityId="act-nome-1"
        title="Meu nome"
        item={item}
        onStart={onStart}
        onRecord={onRecord}
        onFinish={onFinish}
        now={() => (clock += 400)}
      />
    </AccessibilityProvider>,
  );
  return { onStart, onRecord, onFinish, ...utils };
}

/** A região de feedback da tela (o @dnd-kit tem a própria região status, para os anúncios de arrasto). */
const feedback = () => screen.getAllByRole("status").find((el) => !el.id.startsWith("DndLiveRegion"))!;
const board = () => screen.getByRole("group", { name: "Letras" });
const tiles = (letter: string) => within(board()).getAllByRole("button", { name: new RegExp(`^Letra ${letter}`) });
const slotStates = () =>
  [...document.querySelectorAll("[data-slot]")].map((el) => `${el.getAttribute("data-slot")}:${el.getAttribute("data-state")}`);

describe("NameRunner", () => {
  it("mostra as casas do nome e as letras soltas, sem contador de erros", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Escreva seu nome" })).toBeInTheDocument();
    expect(screen.getByText("Letra 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Seu nome" })).toBeInTheDocument();
    expect(slotStates()).toEqual(["1:atual", "2:vazia", "3:vazia"]);
    expect(within(board()).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByText("Seu nome:")).not.toBeInTheDocument(); // modelo escondido nesta config
    expect(document.body.textContent).not.toMatch(/erro|errado|errou/i);
  });

  it("tocar nas letras certas monta o nome; telemetria por casa; Terminar fecha a sessão", async () => {
    const { onRecord, onFinish } = setup();
    const user = userEvent.setup();

    await user.click(tiles("A")[0]!);
    expect(feedback()).toHaveTextContent("Isso!A letra A.");
    expect(slotStates()).toEqual(["1:preenchida", "2:atual", "3:vazia"]);
    expect(tiles("A")).toHaveLength(1); // a peça usada saiu do quadro

    await user.click(tiles("N")[0]!);
    await user.click(tiles("A")[0]!);
    expect(feedback()).toHaveTextContent("Você escreveu seu nome: ANA!");
    const done = screen.getByRole("button", { name: "Terminar" });
    expect(done).toHaveFocus();

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(3));
    expect(onRecord.mock.calls.map((c) => [c[1].itemKey, c[1].optionId])).toEqual([
      ["letra-1", tileId("A", 1)],
      ["letra-2", tileId("N", 0)],
      ["letra-3", tileId("A", 3)],
    ]);

    await user.click(done);
    expect(await screen.findByRole("heading", { name: "Muito bem!" })).toBeInTheDocument();
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("sess-1"));
  });

  it("letra diferente: 'Quase!', volta para o quadro; 2 vezes diz a letra e mostra o modelo; 3 destaca", async () => {
    const { onRecord } = setup();
    const user = userEvent.setup();

    await user.click(tiles("B")[0]!);
    expect(feedback()).toHaveTextContent("Quase!Vamos tentar outra letra.");
    expect(tiles("B")).toHaveLength(1);
    expect(slotStates()[0]).toBe("1:atual");

    await user.click(tiles("N")[0]!);
    expect(feedback()).toHaveTextContent("A próxima letra é A.");
    expect(screen.getByText("Seu nome:")).toBeInTheDocument();
    expect(screen.getByText("ANA")).toBeInTheDocument();

    await user.click(tiles("B")[0]!);
    expect(feedback()).toHaveTextContent("Toque na letra A, que está em destaque.");
    expect(screen.getByRole("button", { name: "Letra A. Dica: esta letra" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Letra A. Dica: esta letra" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(4));
    expect(onRecord.mock.calls.map((c) => [c[1].attemptNo, c[1].helpLevel])).toEqual([
      [1, "NONE"],
      [2, "NONE"],
      [3, "VERBAL_HINT"],
      [4, "VISUAL_HINT"],
    ]);
  });

  it("botão Dica: diz a letra (com o modelo) e depois destaca a peça", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(feedback()).toHaveTextContent("DicaA próxima letra é A.");
    expect(screen.getByText("Seu nome:")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getAllByRole("button", { name: /Dica: esta letra/ })).toHaveLength(1);
  });

  it("funciona só com teclado (Tab até a letra + Enter), e o foco nunca se perde", async () => {
    const { onRecord } = setup();
    const user = userEvent.setup();
    tiles("A")[0]!.focus();
    await user.keyboard("{Enter}");
    expect(within(board()).getAllByRole("button")).toContain(document.activeElement); // foco já na próxima letra livre
    tiles("N")[0]!.focus();
    await user.keyboard("{Enter}");
    tiles("A")[0]!.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Terminar" })).toHaveFocus();
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(3));
  });

  it("modelo configurado pelo professor aparece desde o início; nome composto mostra o espaço", () => {
    setup({
      ...ana,
      showModel: true,
      cells: [
        { kind: "letter", letter: "A" },
        { kind: "gap", char: " " },
        { kind: "letter", letter: "N" },
      ],
    });
    expect(screen.getByText("Seu nome:")).toBeInTheDocument();
    expect(slotStates()).toEqual(["1:atual", "2:vazia"]);
  });

  it("alvos grandes, 24 px entre as letras e sem violações de acessibilidade (axe)", async () => {
    const { container } = setup();
    expect(tiles("N")[0]).toHaveClass("size-[88px]");
    expect(board()).toHaveClass("gap-6");
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(tiles("B")[0]!);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("falha de telemetria não trava a criança", async () => {
    const { onRecord } = setup();
    onRecord.mockRejectedValue(new Error("rede"));
    await userEvent.click(tiles("A")[0]!);
    expect(feedback()).toHaveTextContent("Isso!");
  });
});
