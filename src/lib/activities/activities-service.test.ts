import { getPlayableActivity, listAssignedActivities } from "./queries";
import { assignActivity, createActivity } from "./service";

const m = {
  assignmentFindMany: jest.fn(),
  assignmentFindFirst: jest.fn(),
  assignmentUpsert: jest.fn(),
  activityCreate: jest.fn(),
  activityFindFirst: jest.fn(),
  guidanceFind: jest.fn(),
  auditCreate: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    assignment: {
      findMany: (...a: unknown[]) => m.assignmentFindMany(...a),
      findFirst: (...a: unknown[]) => m.assignmentFindFirst(...a),
      upsert: (...a: unknown[]) => m.assignmentUpsert(...a),
    },
    activity: {
      create: (...a: unknown[]) => m.activityCreate(...a),
      findFirst: (...a: unknown[]) => m.activityFindFirst(...a),
    },
    guidance: { findUnique: (...a: unknown[]) => m.guidanceFind(...a) },
    auditLog: { create: (...a: unknown[]) => m.auditCreate(...a) },
  },
}));

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const content = {
  items: [
    {
      key: "letra-a",
      prompt: "Qual letra?",
      display: "A",
      options: [
        { id: "l-a", label: "a" },
        { id: "l-o", label: "o" },
      ],
      correctId: "l-a",
    },
  ],
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.auditCreate.mockResolvedValue({});
});

describe("queries", () => {
  it("lista só atividades publicadas atribuídas ao aluno", async () => {
    m.assignmentFindMany.mockResolvedValue([{ activity: { id: "a1", title: "Letras", module: "GRAFIA", difficulty: "INICIAL" } }]);
    await expect(listAssignedActivities("stu1")).resolves.toEqual([
      { id: "a1", title: "Letras", module: "GRAFIA", difficulty: "INICIAL" },
    ]);
    expect(m.assignmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "stu1", activity: { published: true } } }),
    );
  });

  it("entrega a atividade normalizada e sem expor o JSON cru", async () => {
    m.assignmentFindFirst.mockResolvedValue({
      activity: { id: "a1", title: "Letras", module: "GRAFIA", difficulty: "INICIAL", instruction: "Ache", content },
    });
    const playable = await getPlayableActivity("stu1", "a1");
    expect(playable?.items[0]).toMatchObject({ key: "letra-a", stimulus: { kind: "letter", display: "A" } });
    expect(playable).not.toHaveProperty("content");
  });

  it("devolve null se não atribuída ou se o conteúdo está inválido", async () => {
    m.assignmentFindFirst.mockResolvedValueOnce(null);
    await expect(getPlayableActivity("stu1", "a1")).resolves.toBeNull();

    m.assignmentFindFirst.mockResolvedValueOnce({
      activity: { id: "a1", title: "x", module: "GRAFIA", difficulty: "INICIAL", instruction: "y", content: { items: [] } },
    });
    await expect(getPlayableActivity("stu1", "a1")).resolves.toBeNull();
  });
});

describe("createActivity", () => {
  it("grava o conteúdo sanitizado e registra auditoria", async () => {
    m.activityCreate.mockResolvedValue({ id: "novo" });
    const dirty = clone(content);
    dirty.items[0]!.prompt = "<b>Qual</b> letra?";

    await expect(
      createActivity("prof1", {
        module: "GRAFIA",
        difficulty: "INICIAL",
        title: "Letras",
        instruction: "Ache",
        content: dirty,
        published: true,
      }),
    ).resolves.toEqual({ id: "novo" });

    const data = m.activityCreate.mock.calls[0]?.[0].data;
    expect(data.content.items[0].prompt).toBe("Qual letra?");
    expect(data.authorId).toBe("prof1");
    expect(m.auditCreate).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "activity.create", targetId: "novo" },
    });
  });
});

describe("assignActivity", () => {
  const input = { activityId: "act12345", studentId: "stu12345" };

  it("atribui quando o adulto acompanha o aluno e a atividade está publicada", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.activityFindFirst.mockResolvedValue({ id: "act12345" });
    m.assignmentUpsert.mockResolvedValue({ id: "as1" });

    await expect(assignActivity("prof1", input)).resolves.toEqual({ ok: true, id: "as1" });
    expect(m.guidanceFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adultId_studentId: { adultId: "prof1", studentId: "stu12345" } } }),
    );
    expect(m.auditCreate).toHaveBeenCalled();
  });

  it("proíbe atribuir a aluno que o adulto não acompanha (LGPD)", async () => {
    m.guidanceFind.mockResolvedValue(null);
    await expect(assignActivity("prof1", input)).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(m.assignmentUpsert).not.toHaveBeenCalled();
  });

  it("não atribui atividade inexistente ou em rascunho", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.activityFindFirst.mockResolvedValue(null);
    await expect(assignActivity("prof1", input)).resolves.toEqual({ ok: false, code: "not_found" });
  });
});
