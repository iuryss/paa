import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { AccessibilityProvider } from "@/components/accessibility-provider";
import { emptyItem, type EditorItem } from "@/lib/activities/editor-model";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import type { SupportedModule } from "@/lib/validation/activities";
import { ActivityEditor } from "./activity-editor";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = jest.fn();
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

function setup(
  module: SupportedModule = "GRAFIA",
  props: Partial<React.ComponentProps<typeof ActivityEditor>> = {},
) {
  const initial = {
    title: "",
    instruction: "",
    difficulty: "INICIAL" as const,
    published: false,
    items: [emptyItem(module)],
    ...(props.initial ?? {}),
  };
  return render(
    <AccessibilityProvider initial={DEFAULT_PREFERENCES}>
      <ActivityEditor module={module} {...props} initial={initial} />
    </AccessibilityProvider>,
  );
}

const filledGrafia = (over: Partial<EditorItem> = {}): EditorItem => ({
  ...emptyItem("GRAFIA"),
  prompt: "Qual é a letra a pequena?",
  display: "A",
  distractors: ["o", "e"],
  ...over,
});

async function fillMeta(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Título"), "Letras do dia");
  await user.type(screen.getByLabelText("Instrução curta"), "Ache a letra pequena");
}

describe("ActivityEditor — validação antes de salvar", () => {
  it("não chama a API e lista o que falta, em português", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Escreva o título da atividade.");
    expect(status).toHaveTextContent("Escreva a instrução curta");
    expect(status).toHaveTextContent("Item 1: escreva a pergunta.");
    expect(status).toHaveTextContent("Item 1: informe a letra");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa opção errada igual à certa", async () => {
    const user = userEvent.setup();
    setup("GRAFIA", { initial: { title: "t", instruction: "i", difficulty: "INICIAL", published: false, items: [filledGrafia({ distractors: ["a", "o"] })] } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByRole("status")).toHaveTextContent("uma opção errada é igual à resposta certa (a)");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ActivityEditor — criar", () => {
  it("monta o conteúdo certo, envia e vai para a página da atividade criada", async () => {
    reply(201, { id: "nova123456" });
    const user = userEvent.setup();
    setup();
    await fillMeta(user);
    await user.type(screen.getByLabelText("Pergunta"), "Qual é a letra a pequena?");
    await user.type(screen.getByLabelText("Letra mostrada (maiúscula)"), "A");
    expect(screen.getByText("a", { selector: "strong" })).toBeInTheDocument(); // resposta derivada
    await user.type(screen.getByLabelText("Opção errada 1"), "o");
    await user.type(screen.getByLabelText("Opção errada 2"), "e");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/professor/atividades/nova123456"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/atividades");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      module: "GRAFIA",
      title: "Letras do dia",
      instruction: "Ache a letra pequena",
      difficulty: "INICIAL",
      markerStyle: "CORES_E_FORMAS",
      published: false,
    });
    expect(body.content.items[0]).toMatchObject({ key: "item-1", display: "A", correctId: "l-a" });
    expect(body.content.items[0].options.map((o: { label: string }) => o.label)).toEqual(["a", "o", "e"]);
  });

  it("mostra mensagem gentil se o servidor falhar", async () => {
    reply(500);
    const user = userEvent.setup();
    setup("GRAFIA", { initial: { title: "t", instruction: "i", difficulty: "INICIAL", published: false, items: [filledGrafia()] } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Não foi possível salvar agora. Tente de novo.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ActivityEditor — itens", () => {
  it("adiciona, reordena e remove itens por botões com rótulo (sem arrastar)", async () => {
    const user = userEvent.setup();
    setup("GRAFIA", {
      initial: {
        title: "t",
        instruction: "i",
        difficulty: "INICIAL",
        published: false,
        items: [filledGrafia({ prompt: "Primeiro" }), filledGrafia({ prompt: "Segundo" })],
      },
    });
    const prompts = () => screen.getAllByLabelText("Pergunta").map((el) => (el as HTMLInputElement).value);
    expect(prompts()).toEqual(["Primeiro", "Segundo"]);

    await user.click(screen.getByRole("button", { name: "Subir item 2" }));
    expect(prompts()).toEqual(["Segundo", "Primeiro"]);
    expect(screen.getByRole("button", { name: "Subir item 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer item 2" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Adicionar item" }));
    expect(prompts()).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Remover item 3" }));
    expect(prompts()).toEqual(["Segundo", "Primeiro"]);
  });

  it("limita a 3 opções erradas", async () => {
    const user = userEvent.setup();
    setup("GRAFIA", { initial: { title: "", instruction: "", difficulty: "INICIAL", published: false, items: [filledGrafia({ distractors: ["o", "e"] })] } });
    await user.click(screen.getByRole("button", { name: "Adicionar opção errada" }));
    expect(screen.getAllByLabelText(/^Opção errada \d$/)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Adicionar opção errada" })).not.toBeInTheDocument();
  });

  it("Matemática: mostra a soma como resposta certa", async () => {
    setup("MATEMATICA", {
      initial: {
        title: "", instruction: "", difficulty: "INICIAL", published: false,
        items: [{ ...emptyItem("MATEMATICA"), a: 4, b: 3 }],
      },
    });
    expect(screen.getByText("7", { selector: "strong" })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Segundo número (0 a 10)"));
    await userEvent.type(screen.getByLabelText("Segundo número (0 a 10)"), "0");
    expect(screen.getByText(/só conta as maçãs/)).toBeInTheDocument();
  });

  it("Localização: a resposta certa é a posição escolhida e a bússola é fixa", async () => {
    reply(201, { id: "loc1234567" });
    const user = userEvent.setup();
    setup("LOCALIZACAO");
    await fillMeta(user);
    await user.type(screen.getByLabelText("Pergunta"), "Onde fica a escola?");
    await user.type(screen.getByLabelText("Nome da peça"), "Escola");
    await user.selectOptions(screen.getByLabelText("Figura da peça"), "escola");
    await user.selectOptions(screen.getByLabelText("Onde a peça fica no mapa (resposta certa)"), "oeste");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const item = JSON.parse(fetchMock.mock.calls[0]![1].body).content.items[0];
    expect(item).toMatchObject({ position: "oeste", correctId: "oeste", piece: { label: "Escola", icon: "escola" } });
    expect(item.options.map((o: { id: string }) => o.id)).toEqual(["norte", "sul", "leste", "oeste"]);
  });

  it("Folha: leitura de apoio com destaque e os 3 tipos de exercício, salvos do jeito certo", async () => {
    reply(201, { id: "folha12345" });
    const user = userEvent.setup();
    setup("FOLHA", {
      initial: { title: "", instruction: "", difficulty: "INICIAL", published: false, items: [emptyItem("FOLHA", "escolha")] },
    });
    await fillMeta(user);

    // Bloco de apoio da folha
    await user.type(screen.getByLabelText("Texto de leitura (opcional)"), "A **matéria** ocupa espaço.");
    await user.selectOptions(screen.getByLabelText("Figura da leitura"), "agua");
    await user.type(screen.getByLabelText("Exemplo resolvido (opcional)"), "Ex.: a pedra é matéria.");

    // Exercício 1: escolha
    expect(screen.getByRole("group", { name: "Exercício 1" })).toHaveTextContent("Escolher a resposta certa");
    await user.type(screen.getByLabelText("Enunciado"), "O que é matéria?");
    await user.type(screen.getByLabelText("Texto da resposta 1"), "O que ocupa espaço");
    await user.type(screen.getByLabelText("Texto da resposta 2"), "Só o ar");

    // Exercício 2: marcar todas
    await user.click(screen.getByRole("button", { name: "Marcar todas as certas" }));
    const ex2 = within(screen.getByRole("group", { name: "Exercício 2" }));
    await user.type(ex2.getByLabelText("Enunciado"), "Marque o que é matéria");
    await user.type(ex2.getByLabelText("Texto da resposta 1"), "Pedra");
    await user.type(ex2.getByLabelText("Texto da resposta 2"), "Saudade");
    await user.type(ex2.getByLabelText("Texto da resposta 3"), "Água");
    expect(ex2.getByRole("checkbox", { name: "Resposta 1: esta vale" })).toBeChecked();
    await user.click(ex2.getByRole("checkbox", { name: "Resposta 3: esta vale" }));

    // Exercício 3: verdadeiro ou falso
    await user.click(screen.getByRole("button", { name: "Verdadeiro ou falso" }));
    const ex3 = within(screen.getByRole("group", { name: "Exercício 3" }));
    expect(ex3.getByLabelText("Enunciado")).toHaveValue("É verdadeiro ou falso?");
    await user.type(ex3.getByLabelText("Texto da frase 1"), "O gelo é sólido.");
    await user.type(ex3.getByLabelText("Texto da frase 2"), "O vapor é sólido.");
    await user.click(within(ex3.getByRole("radiogroup", { name: "A frase 2 é" })).getByRole("radio", { name: "Falsa" }));

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.module).toBe("FOLHA");
    expect(body.content.support).toEqual({ text: "A **matéria** ocupa espaço.", icon: "agua", example: "Ex.: a pedra é matéria." });
    expect(body.content.items.map((i: { type: string }) => i.type)).toEqual(["escolha", "marcar", "vf"]);
    expect(body.content.items[0]).toMatchObject({ correctId: "o-o-que-ocupa-espaco" });
    expect(body.content.items[1]).toMatchObject({ correctIds: ["o-pedra", "o-agua"] });
    expect(body.content.items[2].statements).toEqual([
      { id: "s1", text: "O gelo é sólido.", correct: true },
      { id: "s2", text: "O vapor é sólido.", correct: false },
    ]);
  }, 20_000); // muita digitação simulada

  it("Folha: pré-visualiza com a leitura em destaque, 'marcar todas' e uma frase do V/F por vez", async () => {
    const user = userEvent.setup();
    const marcar = {
      ...emptyItem("FOLHA", "marcar"),
      prompt: "Marque o que é matéria",
      answers: [
        { label: "Pedra", icon: "" as const },
        { label: "Saudade", icon: "" as const },
        { label: "Água", icon: "" as const },
      ],
      correctSet: [0, 2],
    };
    setup("FOLHA", {
      initial: {
        title: "Matéria",
        instruction: "Leia e responda",
        difficulty: "INICIAL",
        published: false,
        items: [marcar],
        sheet: { text: "A **matéria** ocupa espaço.", icon: "", example: "" },
      },
    });
    await user.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    const preview = within(screen.getByRole("region", { name: "Pré-visualização" }));
    expect(preview.getByRole("heading", { name: "Leia" })).toBeInTheDocument();
    expect(preview.getByText("matéria", { selector: "strong" })).toBeInTheDocument();
    expect(preview.getByText("Exercício 1 de 1")).toBeInTheDocument();
    expect(preview.getByText("Marque todas as certas: 0 de 2.")).toBeInTheDocument();

    await user.click(preview.getByRole("button", { name: /^Pedra, / }));
    expect(preview.getByText(/Você achou: Pedra\. Falta 1\./)).toBeInTheDocument();
    expect(preview.getByRole("button", { name: /^Pedra, / })).toHaveAttribute("aria-pressed", "true");
    await user.click(preview.getByRole("button", { name: /^Água, / }));
    expect(preview.getByText("Você achou todas!")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Folha: resposta vazia e destaque aberto são apontados antes de salvar", async () => {
    const user = userEvent.setup();
    setup("FOLHA", {
      initial: { title: "", instruction: "", difficulty: "INICIAL", published: false, items: [emptyItem("FOLHA")] },
    });
    await fillMeta(user);
    await user.type(screen.getByLabelText("Texto de leitura (opcional)"), "A **matéria ocupa espaço.");
    await user.type(screen.getByLabelText("Enunciado"), "O que é matéria?");
    await user.type(screen.getByLabelText("Texto da resposta 1"), "Pedra");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Exercício 1: escreva a resposta 2 (ou remova-a).");
    expect(status).toHaveTextContent("Um destaque ficou aberto");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Escrever o nome: só a configuração, sem marcadores nem itens; pré-visualiza com 'Sol' e salva", async () => {
    reply(201, { id: "nome123456" });
    const user = userEvent.setup();
    setup("NOME", {
      initial: { title: "", instruction: "", difficulty: "INICIAL", published: false, items: [emptyItem("NOME")] },
    });
    expect(screen.queryByRole("group", { name: "Marcadores das respostas e das dicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover item/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pedido para a criança")).toHaveValue("Escreva seu nome");

    await fillMeta(user);
    await user.selectOptions(screen.getByLabelText(/Letras extras no quadro/), "2");
    await user.click(screen.getByRole("radio", { name: "Como o apelido está cadastrado" }));
    await user.click(screen.getByRole("checkbox", { name: /Mostrar o nome como modelo/ }));

    await user.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    const preview = screen.getByRole("region", { name: "Pré-visualização" });
    expect(within(preview).getByText(/nome de exemplo “Sol”/)).toBeInTheDocument();
    expect(within(preview).getAllByRole("button", { name: /^Letra / })).toHaveLength(5); // S, o, l + 2 extras
    await user.click(within(preview).getByRole("button", { name: "Letra S" }));
    expect(within(preview).getByText("A letra S.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({ module: "NOME" });
    expect(body.content).toEqual({
      items: [{ key: "nome", prompt: "Escreva seu nome", extraLetters: 2, letterCase: "COMO_CADASTRADO", showModel: false }],
    });
  });

});

describe("ActivityEditor — editar", () => {
  const base = { title: "Letras", instruction: "Ache", difficulty: "INICIAL" as const, published: false, items: [filledGrafia()] };

  it("PATCH com conteúdo e a mensagem de rascunho / publicada", async () => {
    reply(200, { ok: true });
    const user = userEvent.setup();
    setup("GRAFIA", { activityId: "act1234567", initial: base });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Salvo como rascunho.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/professor/atividades/act1234567");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body).content.items).toHaveLength(1);
    expect(refresh).toHaveBeenCalled();

    await user.click(screen.getByLabelText(/Publicada/));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Salvo. A atividade está publicada.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).published).toBe(true);
  });

  it("com sessões de alunos: conteúdo travado, só título/publicação são enviados", async () => {
    reply(200, { ok: true });
    const user = userEvent.setup();
    setup("GRAFIA", { activityId: "act1234567", sessionCount: 4, initial: base });

    expect(screen.getByText("Conteúdo travado")).toBeInTheDocument();
    expect(screen.getByText(/4 sessões/)).toBeInTheDocument();
    expect(screen.getByLabelText("Pergunta")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Adicionar item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover item 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pré-visualizar" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Novo título");
    // O estilo dos marcadores só muda a apresentação: continua editável mesmo travada.
    await user.click(screen.getByRole("radio", { name: "Só formas" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.title).toBe("Novo título");
    expect(body.markerStyle).toBe("FORMAS");
    expect(body).not.toHaveProperty("content");
  });

  it("estilo dos marcadores: começa no salvo, com explicação de cada opção", () => {
    setup("GRAFIA", { initial: { ...base, markerStyle: "CORES" } });
    expect(screen.getByRole("group", { name: "Marcadores das respostas e das dicas" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Só cores" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Cores e formas" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Só formas" })).toHaveAccessibleDescription(/o triângulo/);
  });

  it("travada: 'Criar cópia' duplica e abre a cópia", async () => {
    reply(201, { id: "copia12345" });
    setup("GRAFIA", { activityId: "act1234567", sessionCount: 1, initial: base });
    await userEvent.click(screen.getByRole("button", { name: "Criar cópia para editar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/professor/atividades/copia12345"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/professor/atividades/act1234567/duplicar");
  });

  it("409 do servidor vira orientação para criar cópia", async () => {
    reply(409);
    setup("GRAFIA", { activityId: "act1234567", initial: base });
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Crie uma cópia/)).toBeInTheDocument();
  });
});

describe("ActivityEditor — pré-visualização", () => {
  const ready = { title: "t", instruction: "i", difficulty: "INICIAL" as const, published: false, items: [filledGrafia()] };

  it("não abre se houver problemas", async () => {
    setup("GRAFIA");
    await userEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    expect(screen.queryByRole("region", { name: "Pré-visualização" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Revise antes de continuar");
  });

  it("roda a atividade de verdade em modo de teste, sem gravar nada", async () => {
    const user = userEvent.setup();
    setup("GRAFIA", { initial: ready });
    await user.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    const preview = screen.getByRole("region", { name: "Pré-visualização" });
    expect(within(preview).getByText("Modo de teste")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { level: 1, name: "Qual é a letra a pequena?" })).toBeInTheDocument();

    await user.click(within(preview).getByRole("button", { name: /^a, / }));
    expect(await within(preview).findByText(/Você achou: a\./)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); // nada é gravado

    await user.click(screen.getByRole("button", { name: "Fechar pré-visualização" }));
    expect(screen.queryByRole("region", { name: "Pré-visualização" })).not.toBeInTheDocument();
  });
});

describe("ActivityEditor — acessibilidade", () => {
  it("passa no axe (vazio, preenchido e travado)", async () => {
    const filled = { title: "t", instruction: "i", difficulty: "INICIAL" as const, published: false, items: [filledGrafia()] };
    const a = setup("GRAFIA");
    expect(await axe(a.container)).toHaveNoViolations();
    a.unmount();
    const b = setup("MATEMATICA", { initial: { ...filled, items: [emptyItem("MATEMATICA")] } });
    expect(await axe(b.container)).toHaveNoViolations();
    b.unmount();
    const c = setup("LOCALIZACAO", { activityId: "act1234567", sessionCount: 2, initial: { ...filled, items: [emptyItem("LOCALIZACAO")] } });
    expect(await axe(c.container)).toHaveNoViolations();
    c.unmount();
    const d = setup("FOLHA", { initial: { ...filled, items: [emptyItem("FOLHA"), emptyItem("FOLHA", "marcar"), emptyItem("FOLHA", "vf")] } });
    expect(await axe(d.container)).toHaveNoViolations();
    d.unmount();
    const e = setup("NOME", { initial: { ...filled, items: [emptyItem("NOME")] } });
    expect(await axe(e.container)).toHaveNoViolations();
  });
});
