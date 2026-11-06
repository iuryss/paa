import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { parseActivityContent } from "@/lib/validation/activities";
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

const feedback = () => screen.getAllByRole("status").find((el) => !el.id.startsWith("DndLiveRegion"))!;
const states = (attr: string) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute("data-state"));

describe("Folha — colocar em ordem", () => {
  it("passos: uma posição por vez; peça fora de ordem é 'Quase!'", async () => {
    const { onRecord, container } = setup({
      type: "ordenar",
      order: "passos",
      pieces: ["Acordar", "Escovar os dentes", "Ir para a escola"],
    });
    const user = userEvent.setup();
    const pieces = within(screen.getByRole("group", { name: "Peças" }));
    expect(states("data-order")).toEqual(["atual", "vazia", "vazia"]);

    await user.click(pieces.getByRole("button", { name: "Ir para a escola" }));
    expect(feedback()).toHaveTextContent("Quase!");
    await user.click(pieces.getByRole("button", { name: "Acordar" }));
    expect(states("data-order")).toEqual(["preenchida", "atual", "vazia"]);
    expect(screen.getByText("Posição 1: Acordar")).toBeInTheDocument();
    await user.click(pieces.getByRole("button", { name: "Escovar os dentes" }));
    await user.click(pieces.getByRole("button", { name: "Ir para a escola" }));
    expect(feedback()).toHaveTextContent("Você colocou tudo na ordem!");

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(4));
    expect(onRecord.mock.calls.map((c) => c[1].itemKey)).toEqual(["item-1-o1", "item-1-o1", "item-1-o2", "item-1-o3"]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("letras repetidas valem em qualquer casa da mesma letra", async () => {
    setup({ type: "ordenar", order: "letras", pieces: ["A", "N", "A"] });
    const user = userEvent.setup();
    const pieces = within(screen.getByRole("group", { name: "Peças" }));
    const [firstA, secondA] = pieces.getAllByRole("button", { name: "A" });
    await user.click(secondA!); // o segundo A serve na 1ª casa
    await user.click(pieces.getByRole("button", { name: "N" }));
    await user.click(firstA!);
    expect(feedback()).toHaveTextContent("Você colocou tudo na ordem!");
  });
});

describe("Folha — nomear imagens", () => {
  it("cada figura recebe a sua palavra, com a extra no banco", async () => {
    const { container } = setup({
      type: "nomear",
      figures: [
        { icon: "gato", answer: "Gato" },
        { image: { id: "cimgbola1234567890abcdef", alt: "Uma bola" }, answer: "Bola" },
      ],
      extras: ["Sol"],
    });
    const user = userEvent.setup();
    expect(screen.getByRole("img", { name: "Gato" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Uma bola" })).toHaveAttribute("src", "/api/imagens/cimgbola1234567890abcdef");
    const words = within(screen.getByRole("group", { name: "Palavras" }));
    expect(words.getAllByRole("button")).toHaveLength(3);

    await user.click(words.getByRole("button", { name: "Sol" }));
    expect(feedback()).toHaveTextContent("Quase!");
    await user.click(words.getByRole("button", { name: "Gato" }));
    expect(states("data-figure")).toEqual(["preenchida", "atual"]);
    await user.click(words.getByRole("button", { name: "Bola" }));
    expect(feedback()).toHaveTextContent("Você nomeou todas!");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Folha — separar em grupos", () => {
  const sort = {
    type: "classificar",
    groups: [
      { id: "g1", label: "Físico" },
      { id: "g2", label: "Químico" },
    ],
    cards: [
      { id: "c1", label: "Gelo derretendo", group: "g1" },
      { id: "c2", label: "Papel amassado", group: "g1" },
      { id: "c3", label: "Ferrugem", group: "g2" },
    ],
  };

  it("um cartão por vez: a mesma caixa recebe vários, e eles ficam guardados dentro dela", async () => {
    const { onRecord, container } = setup(sort);
    const user = userEvent.setup();
    const box = (name: string) => screen.getByRole("button", { name: `Caixa ${name}` });
    expect(screen.getByText("Cartão 1 de 3")).toBeInTheDocument();
    expect(document.querySelector("[data-card='atual']")).toHaveTextContent("Gelo derretendo");

    await user.click(box("Químico"));
    expect(feedback()).toHaveTextContent("Quase!");
    await user.click(box("Físico"));
    expect(feedback()).toHaveTextContent("Isso!Gelo derretendo em Físico.");
    await user.click(box("Físico"));
    await user.click(box("Químico"));
    expect(feedback()).toHaveTextContent("Você separou todos!");
    expect(document.querySelector("[data-card='atual']")).toBeNull();

    const guardados = within(screen.getByRole("list", { name: "Guardados em Físico" }));
    expect(guardados.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Gelo derretendo", "Papel amassado"]);

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(4));
    expect(onRecord.mock.calls.map((c) => [c[1].itemKey, c[1].optionId])).toEqual([
      ["item-1-c1", "g2"],
      ["item-1-c1", "g1"],
      ["item-1-c2", "g1"],
      ["item-1-c3", "g2"],
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("a dica destaca a caixa certa do cartão da vez; funciona com teclado", async () => {
    setup({ ...sort, hint: "Mudou a forma ou o material?" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dica" }));
    expect(feedback()).toHaveTextContent("Mudou a forma ou o material?");
    await user.click(screen.getByRole("button", { name: "Dica" }));
    const hinted = screen.getByRole("button", { name: "Caixa Físico. Dica: esta" });
    hinted.focus();
    await user.keyboard("{Enter}");
    expect(feedback()).toHaveTextContent("Gelo derretendo em Físico.");
  });
});
