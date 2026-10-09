import { contentSchemas, parseActivityContent } from "@/lib/validation/activities";
import {
  emptyItem,
  fromContent,
  move,
  toContent,
  validateItems,
  type EditorItem,
} from "./editor-model";

const grafia = (over: Partial<EditorItem> = {}): EditorItem => ({
  ...emptyItem("GRAFIA"),
  prompt: "Qual é a letra a pequena?",
  display: "A",
  distractors: ["o", "e"],
  ...over,
});
const matematica = (over: Partial<EditorItem> = {}): EditorItem => ({
  ...emptyItem("MATEMATICA"),
  prompt: "Quantas maçãs no total?",
  a: 2,
  b: 3,
  distractors: ["4", "6"],
  ...over,
});
const localizacao = (over: Partial<EditorItem> = {}): EditorItem => ({
  ...emptyItem("LOCALIZACAO"),
  prompt: "Onde fica a escola?",
  pieceLabel: "Escola",
  pieceIcon: "escola",
  position: "leste",
  ...over,
});

describe("toContent — o resultado sempre passa no schema do servidor", () => {
  it("Grafia: a resposta certa é a minúscula da letra mostrada", () => {
    const content = toContent("GRAFIA", [grafia({ display: "B", distractors: ["d", "p"] })]);
    expect(contentSchemas.GRAFIA.safeParse(content).success).toBe(true);
    const r = parseActivityContent("GRAFIA", content);
    expect(r.success && r.items[0]).toMatchObject({
      key: "item-1",
      stimulus: { kind: "letter", display: "B" },
      correctId: "l-b",
    });
    expect(r.success && r.items[0]!.options.map((o) => o.label)).toEqual(["b", "d", "p"]);
  });

  it("Matemática: a resposta certa é a soma, calculada pelo sistema", () => {
    const content = toContent("MATEMATICA", [matematica()]);
    expect(contentSchemas.MATEMATICA.safeParse(content).success).toBe(true);
    const r = parseActivityContent("MATEMATICA", content);
    expect(r.success && r.items[0]).toMatchObject({ correctId: "n-5", stimulus: { kind: "count", a: 2, b: 3 } });
  });

  it("Localização: bússola completa e resposta = posição da peça", () => {
    const content = toContent("LOCALIZACAO", [localizacao()]);
    expect(contentSchemas.LOCALIZACAO.safeParse(content).success).toBe(true);
    const r = parseActivityContent("LOCALIZACAO", content);
    expect(r.success && r.items[0]!.options.map((o) => o.id)).toEqual(["norte", "sul", "leste", "oeste"]);
    expect(r.success && r.items[0]).toMatchObject({ correctId: "leste", stimulus: { position: "leste" } });
  });

  it("gera ids válidos mesmo com acentos, espaços e rótulos vazios", () => {
    const content = toContent("GRAFIA", [grafia({ display: "Ç", distractors: ["ã", "é"] })]);
    expect(contentSchemas.GRAFIA.safeParse(content).success).toBe(true);
    const ids = (content.items[0] as { options: { id: string }[] }).options.map((o) => o.id);
    expect(ids).toEqual(["l-c", "l-a", "l-e"]);
  });

  it("numera as chaves dos itens na ordem e omite dica vazia", () => {
    const content = toContent("GRAFIA", [grafia(), grafia({ hint: "  Parece com a maiúscula  " })]);
    const items = content.items as { key: string; hint?: string }[];
    expect(items.map((i) => i.key)).toEqual(["item-1", "item-2"]);
    expect(items[0]).not.toHaveProperty("hint");
    expect(items[1]!.hint).toBe("Parece com a maiúscula");
  });
});

describe("fromContent — ida e volta sem perder nada", () => {
  it.each([
    ["GRAFIA", [grafia({ hint: "dica", distractors: ["o", "e", "u"] })]],
    ["MATEMATICA", [matematica({ hint: "conte" }), matematica({ a: 0, b: 7, distractors: ["8"] })]],
    ["LOCALIZACAO", [localizacao({ hint: "olhe o mapa", position: "oeste" })]],
  ] as const)("%s", (module, items) => {
    const content = toContent(module, [...items]);
    const parsed = contentSchemas[module].parse(content);
    expect(fromContent(module, parsed)).toEqual(items);
  });
});

describe("validateItems", () => {
  it("aceita itens completos", () => {
    expect(validateItems("GRAFIA", [grafia()])).toEqual([]);
    expect(validateItems("MATEMATICA", [matematica()])).toEqual([]);
    expect(validateItems("LOCALIZACAO", [localizacao()])).toEqual([]);
  });

  it("pede ao menos 1 item e no máximo 20", () => {
    expect(validateItems("GRAFIA", [])).toEqual(["Adicione pelo menos 1 item."]);
    expect(validateItems("GRAFIA", Array.from({ length: 21 }, () => grafia()))).toContain("Use no máximo 20 itens.");
  });

  it("aponta o item com problema, em português", () => {
    const errors = validateItems("GRAFIA", [grafia(), grafia({ prompt: " ", display: "", distractors: [] })]);
    expect(errors).toEqual([
      "Item 2: escreva a pergunta.",
      "Item 2: informe a letra (ou sílaba de até 3 letras) que será mostrada.",
      "Item 2: informe de 1 a 3 opções erradas.",
    ]);
  });

  it("recusa opção errada igual à certa e opções repetidas", () => {
    expect(validateItems("GRAFIA", [grafia({ distractors: ["a", "o"] })])).toContain(
      "Item 1: uma opção errada é igual à resposta certa (a).",
    );
    expect(validateItems("MATEMATICA", [matematica({ distractors: ["5", "6"] })])).toContain(
      "Item 1: uma opção errada é igual à resposta certa (5).",
    );
    expect(validateItems("GRAFIA", [grafia({ distractors: ["o", "O"] })])).toContain(
      "Item 1: há opções erradas repetidas.",
    );
  });

  it("limita os números da Matemática e exige nome da peça na Localização", () => {
    expect(validateItems("MATEMATICA", [matematica({ a: 11 })])).toContain("Item 1: os números vão de 0 a 10.");
    expect(validateItems("LOCALIZACAO", [localizacao({ pieceLabel: "" })])).toContain(
      "Item 1: dê um nome para a peça (ex.: Escola).",
    );
  });

  it("não aceita mais de 3 opções erradas", () => {
    expect(validateItems("GRAFIA", [grafia({ distractors: ["o", "e", "u", "i"] })])).toContain(
      "Item 1: informe de 1 a 3 opções erradas.",
    );
  });
});

describe("move", () => {
  it("reordena sem alterar o original e ignora posições inválidas", () => {
    const list = ["a", "b", "c"];
    expect(move(list, 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(list, 2, 1)).toEqual(["a", "c", "b"]);
    expect(move(list, 0, -1)).toBe(list);
    expect(move(list, 1, 3)).toBe(list);
    expect(list).toEqual(["a", "b", "c"]);
  });
});
