import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import type { MarkerStyle } from "@/lib/activities/markers";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/preferences";
import { parseActivityContent, type PlayItem } from "@/lib/validation/activities";
import { AccessibilityProvider } from "./accessibility-provider";
import { ActivityRunner } from "./activity-runner";

const letters: PlayItem[] = [
  {
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
  },
  {
    key: "letra-b",
    prompt: "Qual é a letra b pequena?",
    options: [
      { id: "l-b", label: "b" },
      { id: "l-d", label: "d" },
    ],
    correctId: "l-b",
    stimulus: { kind: "letter", display: "B" },
  },
];

function setup(
  items: PlayItem[] = letters,
  contentMode: "textual" | "pictografico" = "textual",
  { markerStyle, theme = "calmo" }: { markerStyle?: MarkerStyle; theme?: Preferences["theme"] } = {},
) {
  let clock = 1000;
  const onStart = jest.fn().mockResolvedValue({ ok: true, sessionId: "sess-123" });
  const onRecord = jest.fn().mockResolvedValue({ ok: true });
  const onFinish = jest.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <AccessibilityProvider initial={{ ...DEFAULT_PREFERENCES, contentMode, theme }}>
      <ActivityRunner
        activityId="act-123456"
        title="Letras"
        items={items}
        markerStyle={markerStyle}
        onStart={onStart}
        onRecord={onRecord}
        onFinish={onFinish}
        now={() => (clock += 500)}
      />
    </AccessibilityProvider>,
  );
  return { onStart, onRecord, onFinish, ...utils };
}

/** O nome acessível da opção é "rótulo, marcador" (ex.: "a, círculo azul"). */
const option = (label: string | RegExp) =>
  screen.getByRole("button", { name: typeof label === "string" ? new RegExp(`^${label}, `) : label });

describe("ActivityRunner — fluxo da criança", () => {
  it("mostra a pergunta, o passo e as opções, sem nenhum contador de erros", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: /letra a pequena/ })).toBeInTheDocument();
    expect(screen.getByText("Passo 1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Respostas" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/erro|errado|errou|falhou/i);
  });

  it("não abre sessão nem envia nada antes da primeira resposta", () => {
    const { onStart, onRecord } = setup();
    expect(onStart).not.toHaveBeenCalled();
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("acerto: feedback com palavra + ícone, botão Continuar aparece e recebe o foco", async () => {
    const { onStart, onRecord } = setup();
    await userEvent.click(option("a"));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Isso!");
    expect(status).toHaveTextContent("Você achou: a.");
    expect(status.querySelector("svg")).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Continuar" });
    expect(next).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Dica" })).not.toBeInTheDocument();

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith("act-123456");
    expect(onRecord).toHaveBeenCalledWith("sess-123", {
      itemKey: "letra-a",
      optionId: "l-a",
      helpLevel: "NONE",
      elapsedMs: 500,
      attemptNo: 1,
    });
  });

  it("outra resposta: convite gentil para tentar de novo e telemetria registra a tentativa", async () => {
    const { onRecord } = setup();
    await userEvent.click(option("o"));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Quase!");
    expect(status).toHaveTextContent("Vamos tentar de novo.");
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/erro|errado|errou/i);

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord.mock.calls[0]?.[1]).toMatchObject({ optionId: "l-o", attemptNo: 1, helpLevel: "NONE" });

    // A criança pode tentar de novo e acertar.
    await userEvent.click(option("a"));
    expect(screen.getByRole("status")).toHaveTextContent("Isso!");
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));
    expect(onRecord.mock.calls[1]?.[1]).toMatchObject({ optionId: "l-a", attemptNo: 2 });
  });

  it("cada opção tem um marcador próprio (forma + nome), pela posição na tela", () => {
    setup();
    const buttons = screen.getAllByRole("button", { name: /, / });
    expect(buttons.map((b) => b.getAttribute("data-marker"))).toEqual(["circulo", "triangulo", "quadrado"]);
    expect(option("a")).toHaveAccessibleName("a, círculo azul");
    expect(option("o")).toHaveAccessibleName("o, triângulo amarelo");
    expect(option("a").querySelector("svg[data-marker='circulo'] path")).toHaveClass("fill-marker-azul");
  });

  it("depois de 2 redirecionamentos a dica aponta o marcador; no 3º a opção fica em destaque", async () => {
    const { onRecord } = setup();
    await userEvent.click(option("o"));
    await userEvent.click(option("e"));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Procure o círculo azul.");
    expect(status.querySelector("svg[data-marker='circulo']")).toBeInTheDocument();
    expect(option("a")).toHaveAccessibleName("a, círculo azul");

    await userEvent.click(option("o"));
    expect(screen.getByRole("status")).toHaveTextContent("Toque no círculo azul, que está em destaque.");
    expect(option("a")).toHaveAccessibleName("a, círculo azul. Dica: esta opção");

    await userEvent.click(option("a"));
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(4));
    expect(onRecord.mock.calls[2]?.[1]).toMatchObject({ helpLevel: "VISUAL_HINT", attemptNo: 3 });
    expect(onRecord.mock.calls[3]?.[1]).toMatchObject({ helpLevel: "VISUAL_HINT", attemptNo: 4 });
  });

  it("botão Dica: texto do professor → marcador → destaque", async () => {
    const { onRecord } = setup();
    const hint = () => screen.getByRole("button", { name: "Dica" });
    await userEvent.click(hint());
    expect(screen.getByRole("status")).toHaveTextContent("A letra pequena parece com a grande.");

    await userEvent.click(hint());
    expect(screen.getByRole("status")).toHaveTextContent("Procure o círculo azul.");
    expect(option("a")).toHaveAccessibleName("a, círculo azul");

    await userEvent.click(hint());
    expect(option("a")).toHaveAccessibleName("a, círculo azul. Dica: esta opção");

    await userEvent.click(option("a"));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    expect(onRecord.mock.calls[0]?.[1]).toMatchObject({ helpLevel: "VISUAL_HINT" });
  });

  it("estilo 'só cores': mesma forma em todas, a dica diz a cor", async () => {
    setup(letters, "textual", { markerStyle: "CORES" });
    expect(option("o")).toHaveAccessibleName("o, cor amarelo");
    const shapes = screen.getAllByRole("button", { name: /, / }).map((b) => b.getAttribute("data-marker"));
    expect(new Set(shapes)).toEqual(new Set(["circulo"]));
    await userEvent.click(screen.getByRole("button", { name: "Dica" }));
    await userEvent.click(screen.getByRole("button", { name: "Dica" }));
    expect(screen.getByRole("status")).toHaveTextContent("Procure a cor azul.");
  });

  it("tema Foco Alto: sempre só formas, sem cor, mesmo se o professor escolheu cores", async () => {
    setup(letters, "textual", { markerStyle: "CORES", theme: "foco" });
    expect(option("o")).toHaveAccessibleName("o, triângulo");
    expect(document.querySelector("[class*='fill-marker-']")).toBeNull();
    await userEvent.click(option("o"));
    await userEvent.click(option("e"));
    expect(screen.getByRole("status")).toHaveTextContent("Procure o círculo.");
  });

  it("avança para o próximo passo, move o foco para a pergunta e termina com Muito bem!", async () => {
    const { onFinish, onRecord } = setup();
    await userEvent.click(option("a"));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("Passo 2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.queryByRole("status")).toHaveTextContent("");

    await userEvent.click(option("b"));
    await userEvent.click(screen.getByRole("button", { name: "Terminar" }));

    expect(await screen.findByRole("heading", { name: "Muito bem!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/aluno/atividades");

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("sess-123"));
    // Todas as tentativas foram enviadas ANTES de finalizar.
    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(onRecord.mock.invocationCallOrder[1]).toBeLessThan(onFinish.mock.invocationCallOrder[0]!);
    // A tela final não mostra números de tentativas ou erros.
    expect(document.body.textContent).not.toMatch(/tentativa|erro/i);
  });

  it("funciona só com teclado (Tab + Enter)", async () => {
    const { onRecord } = setup();
    const user = userEvent.setup();
    option("a").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Continuar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Passo 2 de 2")).toBeInTheDocument();
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
  });

  it("falhas de telemetria nunca travam a criança", async () => {
    const onStart = jest.fn().mockRejectedValue(new Error("rede"));
    const onFinish = jest.fn();
    render(
      <AccessibilityProvider initial={DEFAULT_PREFERENCES}>
        <ActivityRunner
          activityId="act-123456"
          title="Letras"
          items={letters}
          onStart={onStart}
          onRecord={jest.fn()}
          onFinish={onFinish}
        />
      </AccessibilityProvider>,
    );
    await userEvent.click(option("a"));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(option("b"));
    await userEvent.click(screen.getByRole("button", { name: "Terminar" }));

    expect(await screen.findByRole("heading", { name: "Muito bem!" })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled(); // sem sessão, nada a finalizar
  });

  it("sessão com resposta recusada pelo servidor também não trava", async () => {
    const { onRecord } = setup();
    onRecord.mockRejectedValue(new Error("500"));
    await userEvent.click(option("a"));
    expect(screen.getByRole("status")).toHaveTextContent("Isso!");
  });

  it("opções mantêm alvo de toque grande e espaçamento ≥ 24px", () => {
    setup();
    expect(option("a")).toHaveClass("min-h-target-lg");
    expect(screen.getByRole("group", { name: "Respostas" })).toHaveClass("gap-6");
  });

  it("não tem violações de acessibilidade (axe), nem após responder", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(option("o"));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("ActivityRunner — módulos", () => {
  const parse = (module: string, content: unknown) => {
    const r = parseActivityContent(module, content);
    if (!r.success) throw new Error("conteúdo de teste inválido");
    return r.items;
  };

  it("Localização: mapa com 'Você' no centro e a peça na direção certa", async () => {
    const items = parse("LOCALIZACAO", {
      items: [
        {
          key: "escola-norte",
          prompt: "Onde fica a escola?",
          piece: { label: "Escola", icon: "escola" },
          position: "norte",
          options: ["norte", "sul", "leste", "oeste"].map((d) => ({ id: d, label: d, icon: d })),
          correctId: "norte",
        },
      ],
    });
    const { onRecord } = setup(items);
    expect(screen.getByRole("img", { name: "Mapa: Escola fica ao norte de você" })).toBeInTheDocument();
    expect(screen.getByText("Você")).toBeInTheDocument();

    await userEvent.click(option("norte"));
    expect(screen.getByRole("status")).toHaveTextContent("Isso!");
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
  });

  it("Matemática: mostra as maçãs e a conta; contagem simples não revela o numeral", () => {
    const sum = parse("MATEMATICA", {
      items: [
        {
          key: "conta-2-1",
          prompt: "Quantas maçãs no total?",
          a: 2,
          b: 1,
          options: [
            { id: "n-3", label: "3" },
            { id: "n-4", label: "4" },
          ],
          correctId: "n-3",
        },
      ],
    });
    const { unmount } = setup(sum);
    expect(screen.getByRole("img", { name: "2 maçãs mais 1 maçãs" })).toBeInTheDocument();
    expect(document.body.textContent).toContain("2 + 1 = ?");
    unmount();

    const count = parse("MATEMATICA", {
      items: [
        {
          key: "conta-3",
          prompt: "Quantas maçãs tem?",
          a: 3,
          b: 0,
          options: [
            { id: "n-3", label: "3" },
            { id: "n-2", label: "2" },
          ],
          correctId: "n-3",
        },
      ],
    });
    setup(count);
    expect(screen.getByRole("img", { name: "3 maçãs" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("= ?");
  });

  it("Perguntas livres: mostra o apoio (figura com nome e texto) e usa a resposta marcada pelo professor", async () => {
    const items = parse("LIVRE", {
      items: [
        {
          key: "item-1",
          prompt: "Qual bicho late?",
          support: "Na casa da Ana tem um bicho que faz au-au.",
          supportIcon: "casa",
          options: [
            { id: "o-gato", label: "Gato", icon: "gato" },
            { id: "o-cachorro", label: "Cachorro", icon: "cachorro" },
          ],
          correctId: "o-cachorro",
        },
      ],
    });
    const { onRecord, container } = setup(items);
    expect(screen.getByRole("img", { name: "Casa" })).toBeInTheDocument();
    expect(screen.getByText("Na casa da Ana tem um bicho que faz au-au.")).toBeInTheDocument();

    await userEvent.click(option("Gato"));
    expect(screen.getByRole("status")).toHaveTextContent("Quase!");
    await userEvent.click(option("Cachorro"));
    expect(screen.getByRole("status")).toHaveTextContent("Você achou: Cachorro.");
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(2));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Perguntas livres sem apoio: nenhuma área vazia", () => {
    const items = parse("LIVRE", {
      items: [
        {
          key: "item-1",
          prompt: "Qual é maior?",
          options: [
            { id: "o-sol", label: "Sol" },
            { id: "o-bola", label: "Bola" },
          ],
          correctId: "o-sol",
        },
      ],
    });
    setup(items);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("Modo pictográfico: opções com pictograma + palavra", () => {
    const items = parse("LOCALIZACAO", {
      items: [
        {
          key: "casa-leste",
          prompt: "Onde fica a casa?",
          piece: { label: "Casa", icon: "casa" },
          position: "leste",
          options: ["leste", "oeste"].map((d) => ({ id: d, label: d, icon: d })),
          correctId: "leste",
        },
      ],
    });
    setup(items, "pictografico");
    const labels = screen.getAllByTestId("pictogram-label");
    expect(labels.length).toBeGreaterThanOrEqual(3); // 2 opções + a peça no mapa
    expect(option(/leste/)).toHaveTextContent("leste");
  });
});

describe("dados que cruzam servidor → cliente", () => {
  it("os itens normalizados são JSON puro (sem funções nem componentes)", () => {
    // Regressão do erro "Only plain objects can be passed to Client Components".
    const parsed = parseActivityContent("LOCALIZACAO", {
      items: [
        {
          key: "escola-norte",
          prompt: "Onde fica a escola?",
          piece: { label: "Escola", icon: "escola" },
          position: "norte",
          options: [
            { id: "norte", label: "Norte", icon: "norte" },
            { id: "sul", label: "Sul", icon: "sul" },
          ],
          correctId: "norte",
        },
      ],
    });
    if (!parsed.success) throw new Error("inválido");
    expect(JSON.parse(JSON.stringify(parsed.items))).toEqual(parsed.items);
  });
});
