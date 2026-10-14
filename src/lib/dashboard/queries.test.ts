import { getInactiveStudents, getStudentReport, getStudentsOverview, guidesStudent, parsePeriod } from "./queries";

const m = {
  guidanceFind: jest.fn(),
  guidanceMany: jest.fn(),
  guidanceCount: jest.fn(),
  userFind: jest.fn(),
  sessionMany: jest.fn(),
  attemptMany: jest.fn(),
  activityMany: jest.fn(),
  assignmentMany: jest.fn(),
  auditCreate: jest.fn(),
  groupBy: jest.fn(),
  closeStale: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    guidance: {
      findUnique: (...a: unknown[]) => m.guidanceFind(...a),
      findMany: (...a: unknown[]) => m.guidanceMany(...a),
      count: (...a: unknown[]) => m.guidanceCount(...a),
    },
    user: { findFirst: (...a: unknown[]) => m.userFind(...a) },
    activitySession: {
      findMany: (...a: unknown[]) => m.sessionMany(...a),
      groupBy: (...a: unknown[]) => m.groupBy(...a),
    },
    attempt: { findMany: (...a: unknown[]) => m.attemptMany(...a) },
    activity: { findMany: (...a: unknown[]) => m.activityMany(...a) },
    assignment: { findMany: (...a: unknown[]) => m.assignmentMany(...a) },
    auditLog: { create: (...a: unknown[]) => m.auditCreate(...a) },
  },
}));

jest.mock("@/lib/telemetry", () => ({ closeStaleSessions: (...a: unknown[]) => m.closeStale(...a) }));

const NOW = new Date("2026-10-07T12:00:00Z");

const sessionRow = {
  id: "s1",
  startedAt: new Date("2026-10-05T10:00:00Z"),
  durationMs: 90_000,
  totalAttempts: 3,
  correctCount: 2,
  redirects: 1,
  maxHelpLevel: "NONE",
  activity: { title: "Letras", module: "GRAFIA" },
};

const interruptedRow = {
  id: "s9",
  startedAt: new Date("2026-10-06T09:00:00Z"),
  durationMs: 45_000,
  totalAttempts: 2,
  activity: { title: "Contas" },
};

const attemptRows = [
  { sessionId: "s1", itemKey: "a", correct: true, helpLevel: "NONE", elapsedMs: 2000, attemptNo: 1 },
  { sessionId: "s1", itemKey: "b", correct: false, helpLevel: "NONE", elapsedMs: 1000, attemptNo: 1 },
  { sessionId: "s1", itemKey: "b", correct: true, helpLevel: "NONE", elapsedMs: 4000, attemptNo: 2 },
];

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.auditCreate.mockResolvedValue({});
  // Sessões concluídas e interrompidas vêm da mesma tabela: o `where.status` decide o que volta.
  m.sessionMany.mockImplementation(async (args: { where: { status: string } }) =>
    args.where.status === "ABANDONED" ? [interruptedRow] : [sessionRow],
  );
  m.attemptMany.mockResolvedValue(attemptRows);
  m.groupBy.mockResolvedValue([]);
  m.closeStale.mockResolvedValue(0);
});

describe("parsePeriod", () => {
  it("aceita 7, 30 e 90; qualquer outra coisa vira 30", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod(["90", "7"])).toBe(90);
    expect(parsePeriod("15")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod("'; DROP TABLE")).toBe(30);
  });
});

describe("guidesStudent", () => {
  it("consulta o vínculo adulto → aluno", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    await expect(guidesStudent("prof1", "stu1")).resolves.toBe(true);
    expect(m.guidanceFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adultId_studentId: { adultId: "prof1", studentId: "stu1" } } }),
    );
    m.guidanceFind.mockResolvedValue(null);
    await expect(guidesStudent("prof1", "stu2")).resolves.toBe(false);
  });
});

describe("getStudentsOverview", () => {
  it("lista só alunos do adulto, com apelido e resumo do período", async () => {
    m.guidanceMany.mockResolvedValue([{ student: { id: "stu1", displayName: "Sol" } }]);
    const [card] = await getStudentsOverview("prof1", 7, NOW);

    expect(card).toMatchObject({ id: "stu1", displayName: "Sol" });
    expect(card?.summary).toMatchObject({ sessions: 1 });
    expect(card?.summary.independence).toBeCloseTo(1 / 2);
    expect(m.guidanceMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adultId: "prof1", student: { active: true } } }),
    );
    // Só sessões concluídas, dentro da janela de 7 dias.
    const where = m.sessionMany.mock.calls[0]?.[0].where;
    expect(where.status).toBe("COMPLETED");
    expect(where.startedAt.gte).toEqual(new Date("2026-09-30T12:00:00Z"));
  });

  it("aluno sem sessões vem com resumo zerado", async () => {
    m.guidanceMany.mockResolvedValue([{ student: { id: "stu1", displayName: "Sol" } }]);
    m.sessionMany.mockResolvedValue([]);
    const [card] = await getStudentsOverview("prof1", 30, NOW);
    expect(card?.summary.sessions).toBe(0);
    expect(m.attemptMany).not.toHaveBeenCalled();
  });
});

describe("getStudentReport", () => {
  beforeEach(() => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.guidanceCount.mockResolvedValue(1);
    m.userFind.mockResolvedValue({ id: "stu1", displayName: "Sol", active: true });
    m.activityMany.mockResolvedValue([
      { id: "a1", title: "Letras", module: "GRAFIA" },
      { id: "a2", title: "Contas", module: "MATEMATICA" },
    ]);
    m.assignmentMany.mockResolvedValue([{ activityId: "a1" }]);
  });

  it("devolve null (e não toca no aluno) se o adulto não tem vínculo — LGPD", async () => {
    m.guidanceFind.mockResolvedValue(null);
    await expect(getStudentReport("prof1", "stu-de-outro", 30, NOW)).resolves.toBeNull();
    expect(m.userFind).not.toHaveBeenCalled();
    expect(m.sessionMany).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("monta o relatório, lista só atividades ainda não atribuídas e audita o acesso", async () => {
    const report = await getStudentReport("prof1", "stu1", 30, NOW);
    expect(report?.student).toEqual({ id: "stu1", displayName: "Sol", active: true });
    expect(report?.otherAdults).toBe(1);
    expect(report?.sessions).toHaveLength(1);
    expect(report?.byModule[0]).toMatchObject({ module: "GRAFIA", sessions: 1 });
    expect(report?.assignable).toEqual([{ id: "a2", title: "Contas", module: "MATEMATICA" }]);
    expect(m.auditCreate).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.report.read", targetId: "stu1" },
    });
  });

  it("devolve null se o usuário vinculado não for aluno", async () => {
    m.userFind.mockResolvedValue(null);
    await expect(getStudentReport("prof1", "stu1", 30, NOW)).resolves.toBeNull();
  });
});

describe("aluno desativado (consentimento revogado)", () => {
  it("o relatório não lê nenhum dado de desempenho, só informa o necessário para reativar ou excluir", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.guidanceCount.mockResolvedValue(2);
    m.userFind.mockResolvedValue({ id: "stu1", displayName: "Sol", active: false });

    const report = await getStudentReport("prof1", "stu1", 30, NOW);

    expect(report).toMatchObject({
      student: { id: "stu1", active: false },
      otherAdults: 2,
      sessions: [],
      assignable: [],
    });
    expect(report?.summary.sessions).toBe(0);
    expect(m.sessionMany).not.toHaveBeenCalled();
    expect(m.attemptMany).not.toHaveBeenCalled();
    expect(m.activityMany).not.toHaveBeenCalled();
    expect(m.auditCreate).toHaveBeenCalled(); // o acesso à página continua auditado
  });
});

describe("getInactiveStudents", () => {
  it("lista só apelido dos alunos desativados que o adulto acompanha", async () => {
    m.guidanceMany.mockResolvedValue([{ student: { id: "stu9", displayName: "Lua" } }]);
    await expect(getInactiveStudents("prof1")).resolves.toEqual([{ id: "stu9", displayName: "Lua" }]);
    expect(m.guidanceMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adultId: "prof1", student: { active: false } } }),
    );
  });
});

describe("sessões interrompidas", () => {
  it("o painel fecha as sessões abandonadas dos alunos do adulto e conta as interrompidas por aluno", async () => {
    m.guidanceMany.mockResolvedValue([
      { student: { id: "stu1", displayName: "Sol" } },
      { student: { id: "stu2", displayName: "Lua" } },
    ]);
    m.groupBy.mockResolvedValue([{ studentId: "stu2", _count: { _all: 3 } }]);

    const cards = await getStudentsOverview("prof1", 30, NOW);

    expect(m.closeStale).toHaveBeenCalledWith({ now: NOW, studentIds: ["stu1", "stu2"] });
    expect(cards.map((c) => [c.displayName, c.interrupted])).toEqual([["Sol", 0], ["Lua", 3]]);
    const where = m.groupBy.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ studentId: { in: ["stu1", "stu2"] }, status: "ABANDONED" });
  });

  it("sem alunos nem consulta ao banco para contar", async () => {
    m.guidanceMany.mockResolvedValue([]);
    await expect(getStudentsOverview("prof1", 30, NOW)).resolves.toEqual([]);
    expect(m.groupBy).not.toHaveBeenCalled();
  });

  it("o relatório lista as interrompidas à parte e elas NÃO entram nos números de autonomia", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.guidanceCount.mockResolvedValue(0);
    m.userFind.mockResolvedValue({ id: "stu1", displayName: "Sol", active: true });
    m.activityMany.mockResolvedValue([]);
    m.assignmentMany.mockResolvedValue([]);

    const report = await getStudentReport("prof1", "stu1", 30, NOW);

    expect(m.closeStale).toHaveBeenCalledWith({ now: NOW, studentIds: ["stu1"] });
    expect(report?.interrupted).toEqual([
      { id: "s9", activityTitle: "Contas", startedAt: new Date("2026-10-06T09:00:00Z"), durationMs: 45_000, attempts: 2 },
    ]);
    expect(report?.sessions).toHaveLength(1); // só a concluída
    expect(report?.summary.sessions).toBe(1);
    const statuses = m.sessionMany.mock.calls.map((c) => c[0].where.status);
    expect(statuses).toEqual(expect.arrayContaining(["COMPLETED", "ABANDONED"]));
  });

  it("aluno desativado não tem sessões interrompidas exibidas nem consulta de uso", async () => {
    m.guidanceFind.mockResolvedValue({ id: "g1" });
    m.guidanceCount.mockResolvedValue(0);
    m.userFind.mockResolvedValue({ id: "stu1", displayName: "Sol", active: false });
    const report = await getStudentReport("prof1", "stu1", 30, NOW);
    expect(report?.interrupted).toEqual([]);
    expect(m.sessionMany).not.toHaveBeenCalled();
    expect(m.closeStale).not.toHaveBeenCalled();
  });
});
