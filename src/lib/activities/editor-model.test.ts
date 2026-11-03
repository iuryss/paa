import { contentSchemas, parseActivityContent } from "@/lib/validation/activities";
import {
  addAnswer,
  addStatement,
  emptyItem,
  fromContent,
  move,
  removeAnswer,
  sheetFromContent,
  toContent,
  toggleCorrect,
  validateItems,
  validateSheet,
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

describe("Folha", () => {
  const escolha = (over: Partial<EditorItem> = {}): EditorItem => ({
    ...emptyItem("FOLHA", "escolha"),
    prompt: "Qual bicho late?",
    hint: "Ele é amigo das pessoas.",
    supportText: "Na casa da Ana tem um bicho que faz au-au.",
    supportIcon: "casa",
    answers: [
      { label: "Gato", icon: "gato" },
      { label: "Cachorro", icon: "cachorro" },
      { label: "Peixe", icon: "" },
    ],
    correctIndex: 1,
    ...over,
  });
  const marcar = (over: Partial<EditorItem> = {}): EditorItem => ({
    ...emptyItem("FOLHA", "marcar"),
    prompt: "Marque os números naturais",
    answers: [
      { label: "2", icon: "" },
      { label: "-3", icon: "" },
      { label: "0", icon: "" },
    ],
    correctSet: [0, 2],
    ...over,
  });
  const vf = (over: Partial<EditorItem> = {}): EditorItem => ({
    ...emptyItem("FOLHA", "vf"),
    prompt: "É verdadeiro ou falso?",
    statements: [
      { text: "O gelo é água no estado sólido.", correct: true },
      { text: "O vapor é água no estado sólido.", correct: false },
    ],
    ...over,
  });
  const sheet = { text: "A **matéria** ocupa espaço.", icon: "agua" as const, example: "Ex.: a pedra é matéria." };

  it("começa pelo tipo pedido: escolha (2 respostas), marcar (3, a 1ª certa) e V/F (2 frases)", () => {
    expect(emptyItem("FOLHA")).toMatchObject({ exType: "escolha", answers: [{ label: "" }, { label: "" }], correctIndex: 0 });
    expect(emptyItem("FOLHA", "marcar")).toMatchObject({ exType: "marcar", correctSet: [0] });
    expect(emptyItem("FOLHA", "marcar").answers).toHaveLength(3);
    expect(emptyItem("FOLHA", "vf").statements).toEqual([
      { text: "", correct: true },
      { text: "", correct: true },
    ]);
  });

  it("toContent: apoio da folha + os 3 tipos, aceito pelo schema e virando passos jogáveis", () => {
    const content = toContent("FOLHA", [escolha(), marcar(), vf()], sheet);
    expect(contentSchemas.FOLHA.safeParse(content).success).toBe(true);
    expect(content.support).toEqual({ text: "A **matéria** ocupa espaço.", icon: "agua", example: "Ex.: a pedra é matéria." });
    const r = parseActivityContent("FOLHA", content);
    if (!r.success) throw new Error("inválido");
    expect(r.sheet).toEqual(content.support);
    expect(r.items.map((i) => i.key)).toEqual(["item-1", "item-2", "item-3-s1", "item-3-s2"]);
    expect(r.items[0]).toMatchObject({ correctId: "o-cachorro", exercise: { index: 1, total: 3 } });
    expect(r.items[1]).toMatchObject({ correctIds: ["o-2", "o-0"] });
    expect(r.items[2]).toMatchObject({
      correctId: "v",
      fixedOrder: true,
      options: [{ id: "v" }, { id: "f" }],
      stimulus: { kind: "free", text: "O gelo é água no estado sólido." },
      exercise: { index: 3, total: 3, part: { index: 1, total: 2 } },
    });
    expect(r.items[3]).toMatchObject({ correctId: "f" });
  });

  it("sem apoio, a folha não leva o campo support", () => {
    expect(toContent("FOLHA", [escolha()])).not.toHaveProperty("support");
  });

  it("ida e volta: fromContent/sheetFromContent devolvem o mesmo formulário", () => {
    const content = toContent("FOLHA", [escolha(), marcar(), vf()], sheet);
    const back = fromContent("FOLHA", content);
    expect(back[0]).toMatchObject({ exType: "escolha", correctIndex: 1, supportIcon: "casa", answers: escolha().answers });
    expect(back[1]).toMatchObject({ exType: "marcar", correctSet: [0, 2] });
    expect(back[2]).toMatchObject({ exType: "vf", statements: vf().statements });
    expect(sheetFromContent(content)).toEqual(sheet);
  });

  it("valida respostas, frases, marcar todas e o bloco de apoio", () => {
    expect(validateItems("FOLHA", [escolha(), marcar(), vf()])).toEqual([]);
    const twins = escolha({ answers: [{ label: "Gato", icon: "" }, { label: "gato", icon: "" }], correctIndex: 0 });
    expect(validateItems("FOLHA", [twins])).toContain("Exercício 1: há respostas repetidas.");
    expect(validateItems("FOLHA", [marcar({ correctSet: [0, 1, 2] })])).toContain(
      "Exercício 1: deixe pelo menos uma resposta que não vale (senão não há o que escolher).",
    );
    expect(validateItems("FOLHA", [vf({ statements: [{ text: " ", correct: true }] })])).toContain(
      "Exercício 1: escreva a frase 1 (ou remova-a).",
    );
    expect(validateSheet({ ...sheet, text: "A **matéria ocupa espaço." })).toContain(
      "Um destaque ficou aberto: use **palavra** (dois asteriscos antes e depois).",
    );
    expect(validateSheet({ ...sheet, text: "x".repeat(801) })).toContain("O texto de leitura pode ter até 800 letras.");
  });

  it("remover resposta mantém as certas; marcar todas nunca fica sem nenhuma certa", () => {
    expect(removeAnswer(escolha({ correctIndex: 2 }), 0)).toMatchObject({ correctIndex: 1 });
    expect(removeAnswer(escolha({ correctIndex: 1 }), 1)).toMatchObject({ correctIndex: 0 });
    expect(removeAnswer(marcar({ correctSet: [0, 2] }), 1)).toMatchObject({ correctSet: [0, 1] });
    expect(removeAnswer(marcar({ correctSet: [1] }), 1)).toMatchObject({ correctSet: [0] });
    expect(toggleCorrect(marcar({ correctSet: [0] }), 0).correctSet).toEqual([0]); // não desmarca a última
    expect(toggleCorrect(marcar({ correctSet: [0] }), 1).correctSet).toEqual([0, 1]);
  });

  it("no máximo 4 respostas (uma por marcador) e 6 frases", () => {
    const four = addAnswer(escolha());
    expect(four.answers).toHaveLength(4);
    expect(addAnswer(four).answers).toHaveLength(4);
    let s = vf();
    for (let i = 0; i < 6; i++) s = addStatement(s);
    expect(s.statements).toHaveLength(6);
  });
});

describe("Escrever o nome", () => {
  it("começa com o pedido pronto, 3 letras extras, maiúsculas e modelo visível", () => {
    expect(emptyItem("NOME")).toMatchObject({ prompt: "Escreva seu nome", nameExtra: 3, nameCase: "MAIUSCULAS", nameModel: true });
  });

  it("toContent gera só a configuração, aceita pelo schema; ida e volta preserva", () => {
    const item = { ...emptyItem("NOME"), nameExtra: 5, nameCase: "COMO_CADASTRADO" as const, nameModel: false };
    const content = toContent("NOME", [item]);
    expect(content).toEqual({
      items: [{ key: "nome", prompt: "Escreva seu nome", extraLetters: 5, letterCase: "COMO_CADASTRADO", showModel: false }],
    });
    const parsed = parseActivityContent("NOME", content);
    expect(parsed.success && parsed.name).toMatchObject({ extraLetters: 5, letterCase: "COMO_CADASTRADO" });
    expect(parsed.success && parsed.items).toEqual([]);
    expect(fromContent("NOME", content)[0]).toMatchObject({ nameExtra: 5, nameCase: "COMO_CADASTRADO", nameModel: false });
  });

  it("valida o pedido e a quantidade de letras extras", () => {
    expect(validateItems("NOME", [emptyItem("NOME")])).toEqual([]);
    expect(validateItems("NOME", [{ ...emptyItem("NOME"), prompt: " " }])).toContain(
      "Escreva o pedido para a criança (ex.: Escreva seu nome).",
    );
    expect(validateItems("NOME", [{ ...emptyItem("NOME"), nameExtra: 9 }])).toContain("Use de 0 a 6 letras extras.");
    expect(validateItems("NOME", [emptyItem("NOME"), emptyItem("NOME")])).toContain("Esta atividade tem uma configuração só.");
  });

  it("o schema recusa letras extras demais, chave diferente e dois itens", () => {
    const ok = toContent("NOME", [emptyItem("NOME")]) as { items: Record<string, unknown>[] };
    expect(contentSchemas.NOME.safeParse(ok).success).toBe(true);
    expect(contentSchemas.NOME.safeParse({ items: [{ ...ok.items[0], extraLetters: 7 }] }).success).toBe(false);
    expect(contentSchemas.NOME.safeParse({ items: [{ ...ok.items[0], key: "outro" }] }).success).toBe(false);
    expect(contentSchemas.NOME.safeParse({ items: [ok.items[0], ok.items[0]] }).success).toBe(false);
  });
});
