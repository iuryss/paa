import {
  assignActivitySchema,
  createActivitySchema,
  parseActivityContent,
} from "./activities";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const dirs = ["norte", "sul", "leste", "oeste"].map((d) => ({ id: d, label: d }));

const localizacao = {
  items: [
    {
      key: "escola-norte",
      prompt: "Onde fica a escola?",
      hint: "Olhe o mapa.",
      piece: { label: "Escola", icon: "escola" },
      position: "norte",
      options: dirs,
      correctId: "norte",
    },
  ],
};

const grafia = {
  items: [
    {
      key: "letra-a",
      prompt: "Qual é a letra a pequena?",
      display: "A",
      options: [
        { id: "l-a", label: "a" },
        { id: "l-o", label: "o" },
      ],
      correctId: "l-a",
    },
  ],
};

const matematica = {
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
};

describe("parseActivityContent", () => {
  it("normaliza Localização em estímulo de mapa", () => {
    const r = parseActivityContent("LOCALIZACAO", localizacao);
    expect(r.success && r.items[0]).toMatchObject({
      key: "escola-norte",
      correctId: "norte",
      hint: "Olhe o mapa.",
      stimulus: { kind: "map", position: "norte", piece: { label: "Escola", icon: "escola" } },
    });
  });

  it("normaliza Grafia em estímulo de letra", () => {
    const r = parseActivityContent("GRAFIA", grafia);
    expect(r.success && r.items[0]?.stimulus).toEqual({ kind: "letter", display: "A" });
  });

  it("normaliza Matemática em estímulo de contagem", () => {
    const r = parseActivityContent("MATEMATICA", matematica);
    expect(r.success && r.items[0]?.stimulus).toEqual({ kind: "count", a: 2, b: 1 });
  });

  it("sanitiza HTML do texto e não deixa campo extra passar", () => {
    const dirty = clone(grafia);
    dirty.items[0]!.prompt = "<img src=x onerror=alert(1)>Qual letra?";
    const r = parseActivityContent("GRAFIA", dirty);
    expect(r.success && r.items[0]?.prompt).toBe("Qual letra?");

    const extra = clone(grafia) as unknown as { items: Record<string, unknown>[] };
    extra.items[0]!.script = "x";
    expect(parseActivityContent("GRAFIA", extra).success).toBe(false);
  });

  it("rejeita módulo não suportado (Ciências ainda não tem jogo) e lixo", () => {
    expect(parseActivityContent("CIENCIAS", grafia).success).toBe(false);
    expect(parseActivityContent("GRAFIA", null).success).toBe(false);
    expect(parseActivityContent("GRAFIA", { items: [] }).success).toBe(false);
  });

  it("rejeita resposta correta fora das opções", () => {
    const bad = clone(grafia);
    bad.items[0]!.correctId = "l-z";
    expect(parseActivityContent("GRAFIA", bad).success).toBe(false);
  });

  it("rejeita chaves de item repetidas e opções repetidas", () => {
    const dup = { items: [grafia.items[0], grafia.items[0]] };
    expect(parseActivityContent("GRAFIA", dup).success).toBe(false);

    const sameOptions = clone(grafia);
    sameOptions.items[0]!.options = [
      { id: "l-a", label: "a" },
      { id: "l-a", label: "b" },
    ];
    expect(parseActivityContent("GRAFIA", sameOptions).success).toBe(false);
  });

  it("Localização: a resposta correta precisa ser a posição da peça", () => {
    const wrong = clone(localizacao);
    wrong.items[0]!.correctId = "sul";
    expect(parseActivityContent("LOCALIZACAO", wrong).success).toBe(false);
  });

  it("Matemática: limita os números e exige inteiros", () => {
    const big = clone(matematica);
    big.items[0]!.a = 11;
    expect(parseActivityContent("MATEMATICA", big).success).toBe(false);
    big.items[0]!.a = 1.5;
    expect(parseActivityContent("MATEMATICA", big).success).toBe(false);
  });

  it("limita opções entre 2 e 4 e a 20 itens", () => {
    const one = clone(grafia);
    one.items[0]!.options = [{ id: "l-a", label: "a" }];
    expect(parseActivityContent("GRAFIA", one).success).toBe(false);

    const many = {
      items: Array.from({ length: 21 }, (_, i) => ({ ...grafia.items[0]!, key: `k${i}` })),
    };
    expect(parseActivityContent("GRAFIA", many).success).toBe(false);
  });

  it("só aceita pictogramas da lista fechada", () => {
    const bad = clone(localizacao);
    bad.items[0]!.piece.icon = "https://evil.test/x.svg";
    expect(parseActivityContent("LOCALIZACAO", bad).success).toBe(false);
  });
});

describe("createActivitySchema", () => {
  const valid = {
    module: "GRAFIA",
    title: "Letras",
    instruction: "Ache a letra",
    content: grafia,
  };

  it("aplica padrões (dificuldade inicial, rascunho)", () => {
    expect(createActivitySchema.parse(valid)).toMatchObject({
      difficulty: "INICIAL",
      published: false,
      markerStyle: "CORES_E_FORMAS",
    });
  });

  it("aceita os três estilos de marcador e recusa outros", () => {
    for (const markerStyle of ["CORES_E_FORMAS", "FORMAS", "CORES"]) {
      expect(createActivitySchema.safeParse({ ...valid, markerStyle }).success).toBe(true);
    }
    expect(createActivitySchema.safeParse({ ...valid, markerStyle: "NEON" }).success).toBe(false);
  });

  it("rejeita conteúdo que não bate com o módulo", () => {
    expect(createActivitySchema.safeParse({ ...valid, module: "MATEMATICA" }).success).toBe(false);
  });

  it("rejeita CIENCIAS e campos extras (mass assignment)", () => {
    expect(createActivitySchema.safeParse({ ...valid, module: "CIENCIAS" }).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...valid, authorId: "outro" }).success).toBe(false);
  });
});

describe("assignActivitySchema", () => {
  it("aceita ids válidos e rejeita injeção", () => {
    expect(assignActivitySchema.safeParse({ activityId: "seed-grafia", studentId: "clx12345abc" }).success).toBe(true);
    expect(assignActivitySchema.safeParse({ activityId: "x'; DROP TABLE", studentId: "clx12345abc" }).success).toBe(false);
  });
});
