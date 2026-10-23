import {
  deleteActivity,
  duplicateActivity,
  getActivityForEdit,
  listActivitiesForAdult,
  updateActivity,
} from "./service";

const m = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  audit: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    activity: {
      findMany: (...a: unknown[]) => m.findMany(...a),
      findFirst: (...a: unknown[]) => m.findFirst(...a),
      create: (...a: unknown[]) => m.create(...a),
      update: (...a: unknown[]) => m.update(...a),
      delete: (...a: unknown[]) => m.delete(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));

const content = {
  items: [
    {
      key: "item-1",
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

const row = (over: Record<string, unknown> = {}) => ({
  id: "act1",
  title: "Letras",
  module: "GRAFIA",
  difficulty: "INICIAL",
  published: false,
  updatedAt: new Date("2026-10-08T10:00:00Z"),
  author: { displayName: "Profa" },
  _count: { sessions: 2, assignments: 3 },
  ...over,
});

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.audit.mockResolvedValue({});
  m.update.mockResolvedValue({});
});

describe("listActivitiesForAdult", () => {
  it("separa as minhas (todas) da biblioteca (publicadas por colegas)", async () => {
    m.findMany.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row({ id: "act2", author: { displayName: "Beto" } })]);
    const out = await listActivitiesForAdult("prof1");

    expect(out.mine[0]).toMatchObject({ id: "act1", sessions: 2, assignments: 3, authorName: "Profa" });
    expect(out.library[0]).toMatchObject({ id: "act2", authorName: "Beto" });
    expect(m.findMany.mock.calls[0]?.[0].where).toEqual({ authorId: "prof1" });
    expect(m.findMany.mock.calls[1]?.[0].where).toEqual({ published: true, authorId: { not: "prof1" } });
  });
});

describe("getActivityForEdit", () => {
  it("devolve o formulário do editor reconstruído do conteúdo, só para o autor", async () => {
    m.findFirst.mockResolvedValue({ ...row(), instruction: "Ache", content });
    const out = await getActivityForEdit("prof1", "act1");

    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({ id: "act1", authorId: "prof1" });
    expect(out).toMatchObject({ id: "act1", module: "GRAFIA", sessionCount: 2, instruction: "Ache" });
    expect(out?.items[0]).toMatchObject({ prompt: "Qual é a letra a pequena?", display: "A", distractors: ["o"] });
  });

  it("devolve null para atividade alheia, inexistente, de módulo sem editor ou com conteúdo corrompido", async () => {
    m.findFirst.mockResolvedValueOnce(null);
    await expect(getActivityForEdit("prof1", "x")).resolves.toBeNull();
    m.findFirst.mockResolvedValueOnce({ ...row({ module: "CIENCIAS" }), instruction: "x", content });
    await expect(getActivityForEdit("prof1", "x")).resolves.toBeNull();
    m.findFirst.mockResolvedValueOnce({ ...row(), instruction: "x", content: { items: [] } });
    await expect(getActivityForEdit("prof1", "x")).resolves.toBeNull();
  });
});

describe("updateActivity", () => {
  const owned = (sessions = 0) => m.findFirst.mockResolvedValue({ module: "GRAFIA", _count: { sessions } });

  it("só o autor atualiza (consulta por id + autor)", async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(updateActivity("outro", "act1", { title: "Novo" })).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({ id: "act1", authorId: "outro" });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("atualiza título, publicação, dificuldade e estilo das dicas mesmo com sessões", async () => {
    owned(5);
    await expect(
      updateActivity("prof1", "act1", {
        title: "Novo",
        published: true,
        difficulty: "AVANCADO",
        markerStyle: "CORES",
      }),
    ).resolves.toEqual({ ok: true });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "act1" },
      data: { title: "Novo", published: true, difficulty: "AVANCADO", markerStyle: "CORES" },
    });
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "prof1", action: "activity.update", targetId: "act1" } });
  });

  it("sem sessões, grava o conteúdo já validado e sanitizado", async () => {
    owned(0);
    const dirty = structuredCloneish(content);
    dirty.items[0]!.prompt = "<b>Qual</b> é a letra a pequena?";
    await expect(updateActivity("prof1", "act1", { content: dirty })).resolves.toEqual({ ok: true });
    expect(m.update.mock.calls[0]?.[0].data.content.items[0].prompt).toBe("Qual é a letra a pequena?");
  });

  it("com sessões gravadas, o conteúdo fica travado (não distorce os gráficos)", async () => {
    owned(3);
    await expect(updateActivity("prof1", "act1", { content })).resolves.toEqual({ ok: false, code: "locked" });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("recusa conteúdo inválido para o módulo", async () => {
    owned(0);
    await expect(updateActivity("prof1", "act1", { content: { items: [] } })).resolves.toEqual({
      ok: false,
      code: "invalid_content",
    });
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe("duplicateActivity", () => {
  it("copia atividade própria ou publicada como RASCUNHO do adulto", async () => {
    m.findFirst.mockResolvedValue({
      module: "GRAFIA",
      difficulty: "INICIAL",
      title: "Letras",
      instruction: "Ache",
      content,
      markerStyle: "FORMAS",
    });
    m.create.mockResolvedValue({ id: "copia1" });

    await expect(duplicateActivity("prof1", "act1")).resolves.toEqual({ ok: true, id: "copia1" });
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: "act1",
      OR: [{ authorId: "prof1" }, { published: true }],
    });
    expect(m.create.mock.calls[0]?.[0].data).toMatchObject({
      title: "Cópia de Letras",
      published: false,
      authorId: "prof1",
      content,
      markerStyle: "FORMAS",
    });
  });

  it("não copia rascunho de outra pessoa", async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(duplicateActivity("prof1", "rascunho-alheio")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("limita o título a 80 caracteres", async () => {
    m.findFirst.mockResolvedValue({ module: "GRAFIA", difficulty: "INICIAL", title: "x".repeat(80), instruction: "i", content });
    m.create.mockResolvedValue({ id: "c" });
    await duplicateActivity("prof1", "act1");
    expect(m.create.mock.calls[0]?.[0].data.title).toHaveLength(80);
  });
});

describe("deleteActivity", () => {
  it("exclui atividade própria sem sessões e audita", async () => {
    m.findFirst.mockResolvedValue({ _count: { sessions: 0 } });
    m.delete.mockResolvedValue({});
    await expect(deleteActivity("prof1", "act1")).resolves.toEqual({ ok: true });
    expect(m.delete).toHaveBeenCalledWith({ where: { id: "act1" } });
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "prof1", action: "activity.delete", targetId: "act1" } });
  });

  it("não exclui quando já há sessões de alunos", async () => {
    m.findFirst.mockResolvedValue({ _count: { sessions: 1 } });
    await expect(deleteActivity("prof1", "act1")).resolves.toEqual({ ok: false, code: "has_sessions" });
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("não exclui atividade de outra pessoa", async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(deleteActivity("prof1", "act1")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.delete).not.toHaveBeenCalled();
  });
});

function structuredCloneish<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
