import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { parseActivityContent } from "@/lib/validation/activities";
import { AccessibilityProvider } from "./accessibility-provider";
import { ActivityRunner } from "./activity-runner";

const sheet = {
  items: [
    {
      type: "lacunas",
      key: "item-1",
      prompt: "Complete a frase",
      hint: "Leia o texto de novo.",
      text: "A [água] ocupa [espaço].",
      extras: ["fogo"],
    },
    {
      type: "ligar",
      key: "item-2",
      prompt: "Ligue o objeto à forma",
      pairs: [
        { id: "p1", left: { label: "Bola" }, right: { label: "Círculo" } },
        { id: "p2", left: { label: "Dado" }, right: { label: "Quadrado" } },
      ],
    },
  ],
};

function setup() {
  const r = parseActivityContent("FOLHA", sheet);
  if (!r.success) throw new Error("inválido");
  const onRecord = jest.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <AccessibilityProvider initial={DEFAULT_PREFERENCES}>
      <ActivityRunner
        activityId="act-123456"
        title="Lacunas e pares"
        items={r.items}
        sheet={r.sheet}
        onStart={jest.fn().mockResolvedValue({ ok: true, sessionId: "s1" })}
        onRecord={onRecord}
        onFinish={jest.fn().mockResolvedValue({ ok: true })}
      />
    </AccessibilityProvider>,
  );
  return { onRecord, ...utils };
}

const words = () => within(screen.getByRole("group", { name: "Palavras" }));
const feedback = () => screen.getAllByRole("status").find((el) => !el.id.startsWith("DndLiveRegion"))!;
const gaps = () => [...document.querySelectorAll("[data-gap]")].map((el) => el.getAttribute("data-state"));

describe("Folha — completar lacunas", () => {
  it("toca as palavras na ordem das lacunas; a extra é 'Quase!'; telemetria por lacuna", async () => {
    const { onRecord } = setup();
    const user = userEvent.setup();
    expect(screen.getByText("Exercício 1 de 2")).toBeInTheDocument();
    expect(gaps()).toEqual(["atual", "vazia"]);
    expect(words().getAllByRole("button")).toHaveLength(3);

    await user.click(words().getByRole("button", { name: "fogo" }));
    expect(feedback()).toHaveTextContent("Quase!Vamos tentar outra.");

    await user.click(words().getByRole("button", { name: "água" }));
    expect(feedback()).toHaveTextContent("Isso!“água”.");
    expect(gaps()).toEqual(["preenchida", "atual"]);
    expect(screen.getByText("Lacuna 1: água")).toBeInTheDocument();

    await user.click(words().getByRole("button", { name: "espaço" }));
    expect(feedback()).toHaveTextContent("Você completou tudo!");
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveFocus();

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(3));
    expect(onRecord.mock.calls.map((c) => [c[1].itemKey, c[1].optionId])).toEqual([
      ["item-1-l1", "w3"],
      ["item-1-l1", "w1"],
      ["item-1-l2", "w2"],
    ]);
  });

  it("Dica: primeiro a dica do professor, depois a palavra em destaque", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(feedback()).toHaveTextContent("DicaLeia o texto de novo.");
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(feedback()).toHaveTextContent("Toque em “água”, que está em destaque.");
    expect(words().getByRole("button", { name: "água. Dica: esta" })).toBeInTheDocument();
  });

  it("funciona só com teclado (Enter na palavra) e não tem violações (axe)", async () => {
    const { container } = setup();
    const user = userEvent.setup();
    words().getByRole("button", { name: "água" }).focus();
    await user.keyboard("{Enter}");
    expect(gaps()).toEqual(["preenchida", "atual"]);
    expect(words().getAllByRole("button")).toContain(document.activeElement); // foco na próxima palavra
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Folha — ligar pares", () => {
  async function goToPairs(user: ReturnType<typeof userEvent.setup>) {
    await user.click(words().getByRole("button", { name: "água" }));
    await user.click(words().getByRole("button", { name: "espaço" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
  }

  it("liga um por vez (o item da vez fica destacado); par diferente é 'Quase!'; os ligados ficam marcados", async () => {
    const { onRecord, container } = setup();
    const user = userEvent.setup();
    await goToPairs(user);
    expect(screen.getByText("Exercício 2 de 2")).toBeInTheDocument();
    const lefts = () => [...document.querySelectorAll("[data-left]")].map((el) => el.getAttribute("data-state"));
    expect(lefts()).toEqual(["atual", "esperando"]);
    expect(screen.getByText(": o próximo para ligar")).toBeInTheDocument();

    const right = within(screen.getByRole("group", { name: "Para ligar" }));
    await user.click(right.getByRole("button", { name: "Quadrado" }));
    expect(feedback()).toHaveTextContent("Quase!");
    await user.click(right.getByRole("button", { name: "Círculo" }));
    expect(feedback()).toHaveTextContent("Isso!Bola com Círculo.");
    expect(lefts()).toEqual(["ligado", "atual"]);
    expect(screen.getByText(": ligado com Círculo")).toBeInTheDocument();
    expect(right.getByRole("button", { name: "Círculo" })).toHaveAttribute("aria-disabled", "true");
    expect(container.querySelectorAll("svg line")).toHaveLength(1); // a linha do par

    await user.click(right.getByRole("button", { name: "Quadrado" }));
    expect(feedback()).toHaveTextContent("Você ligou todos!");
    expect(container.querySelectorAll("svg line")).toHaveLength(2);
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(5)); // 2 das lacunas + 3 do ligar
    expect(onRecord.mock.calls.slice(2).map((c) => [c[1].itemKey, c[1].optionId])).toEqual([
      ["item-2-p1", "p2"],
      ["item-2-p1", "p1"],
      ["item-2-p2", "p2"],
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
