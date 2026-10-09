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
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.title).toBe("Novo título");
    expect(body).not.toHaveProperty("content");
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

    await user.click(within(preview).getByRole("button", { name: "a" }));
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
  });
});
