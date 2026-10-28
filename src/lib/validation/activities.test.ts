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

  describe("Folha", () => {
    const folha = {
      support: { text: "Na casa da **Ana** tem um bicho.", icon: "casa" },
      items: [
        {
          type: "escolha",
          key: "item-1",
          prompt: "Qual bicho late?",
          support: "<i>Ele</i> late.",
          options: [
            { id: "o-gato", label: "Gato", icon: "gato" },
            { id: "o-cachorro", label: "Cachorro", icon: "cachorro" },
          ],
          correctId: "o-cachorro",
        },
        {
          type: "marcar",
          key: "item-2",
          prompt: "Marque os que voam",
          options: [
            { id: "o-passaro", label: "Pássaro" },
            { id: "o-peixe", label: "Peixe" },
            { id: "o-borboleta", label: "Borboleta" },
          ],
          correctIds: ["o-passaro", "o-borboleta"],
        },
        { type: "vf", key: "item-3", prompt: "Verdadeiro ou falso?", statements: [{ id: "s1", text: "O peixe nada.", correct: true }] },
      ],
    };
    type Folha = Record<string, unknown> & { support: Record<string, unknown>; items: Record<string, unknown>[] };
    const changed = (mutate: (c: Folha) => void) => {
      const c = clone(folha) as unknown as Folha;
      mutate(c);
      return parseActivityContent("FOLHA", c).success;
    };

    it("aceita os 3 tipos, sanitiza e devolve o apoio da folha", () => {
      const r = parseActivityContent("FOLHA", folha);
      if (!r.success) throw new Error("inválido");
      expect(r.sheet).toEqual({ text: "Na casa da **Ana** tem um bicho.", icon: "casa" });
      expect(r.items[0]?.stimulus).toEqual({ kind: "free", text: "Ele late." });
      expect(r.items.map((i) => i.key)).toEqual(["item-1", "item-2", "item-3-s1"]);
    });

    it("recusa: certa fora das opções, marcar com tudo certo, tipo desconhecido, texto longo, figura fora da lista", () => {
      expect(changed((c) => (c.items[0]!.correctId = "o-lobo"))).toBe(false);
      expect(changed((c) => (c.items[1]!.correctIds = ["o-passaro", "o-peixe", "o-borboleta"]))).toBe(false);
      expect(changed((c) => (c.items[2]!.type = "desenho"))).toBe(false);
      expect(changed((c) => (c.support.text = "x".repeat(801)))).toBe(false);
      expect(changed((c) => (c.support.icon = "https://exemplo.test/foto.png"))).toBe(false);
    });

    it("recusa chaves repetidas, inclusive as que nascem das frases do V/F", () => {
      expect(changed((c) => (c.items[0]!.key = "item-3-s1"))).toBe(false);
    });

    it("o formato antigo das perguntas livres (LIVRE) não é mais aceito", () => {
      expect(parseActivityContent("LIVRE", { items: [folha.items[0]] }).success).toBe(false);
    });
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
