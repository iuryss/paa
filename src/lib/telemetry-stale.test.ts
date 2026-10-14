import { closeStaleSessions, finishSession, MAX_SESSION_MS, recordAttempt, STALE_AFTER_MS } from "./telemetry";

const m = {
  sessionFind: jest.fn(),
  sessionUpdate: jest.fn(),
  sessionMany: jest.fn(),
  sessionUpdateMany: jest.fn(),
  attemptCreate: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    activitySession: {
      findFirst: (...a: unknown[]) => m.sessionFind(...a),
      update: (...a: unknown[]) => m.sessionUpdate(...a),
      findMany: (...a: unknown[]) => m.sessionMany(...a),
      updateMany: (...a: unknown[]) => m.sessionUpdateMany(...a),
    },
    attempt: { create: (...a: unknown[]) => m.attemptCreate(...a) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

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
const openSession = { status: "IN_PROGRESS", maxHelpLevel: "NONE", activity: { module: "GRAFIA", content } };
const attempt = { itemKey: "letra-a", optionId: "l-a", helpLevel: "NONE" as const, elapsedMs: 1500, attemptNo: 1 };

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.attemptCreate.mockResolvedValue({});
  m.sessionUpdate.mockResolvedValue({});
  m.sessionUpdateMany.mockResolvedValue({ count: 1 });
});

describe("sessão interrompida: a criança volta", () => {
  it("uma resposta em sessão INTERROMPIDA reabre a sessão (nada se perde)", async () => {
    m.sessionFind.mockResolvedValue({ ...openSession, status: "ABANDONED" });
    await expect(recordAttempt("stu1", "sess1", attempt)).resolves.toEqual({ correct: true });
    expect(m.attemptCreate).toHaveBeenCalled();
    expect(m.sessionUpdate.mock.calls[0]?.[0].data).toMatchObject({
      status: "IN_PROGRESS",
      finishedAt: null,
      durationMs: null,
      totalAttempts: { increment: 1 },
    });
  });

  it("sessão em andamento não recebe campos de reabertura", async () => {
    m.sessionFind.mockResolvedValue(openSession);
    await recordAttempt("stu1", "sess1", attempt);
    expect(m.sessionUpdate.mock.calls[0]?.[0].data).not.toHaveProperty("status");
  });

  it("sessão CONCLUÍDA continua fechada para novas respostas", async () => {
    m.sessionFind.mockResolvedValue({ ...openSession, status: "COMPLETED" });
    await expect(recordAttempt("stu1", "sess1", attempt)).rejects.toMatchObject({ code: "closed" });
  });

  it("terminar uma sessão interrompida a conclui normalmente", async () => {
    const startedAt = new Date("2026-10-07T10:00:00Z");
    m.sessionFind.mockResolvedValue({ status: "ABANDONED", startedAt, durationMs: 1000 });
    const now = new Date("2026-10-07T10:05:00Z");
    await expect(finishSession("stu1", "sess1", now)).resolves.toEqual({ durationMs: 300_000 });
    expect(m.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { status: "COMPLETED", finishedAt: now, durationMs: 300_000 },
    });
  });
});

describe("closeStaleSessions", () => {
  const NOW = new Date("2026-10-14T12:00:00Z");
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const session = (id: string, startedAgo: number, lastAttemptAgo?: number) => ({
    id,
    startedAt: ago(startedAgo),
    attempts: lastAttemptAgo === undefined ? [] : [{ createdAt: ago(lastAttemptAgo) }],
  });

  it("fecha como INTERROMPIDA, com fim = última resposta (a duração não infla com o tempo parado)", async () => {
    m.sessionMany.mockResolvedValue([session("s1", 3 * HOUR, 3 * HOUR - 90_000)]); // jogou 90 s e parou
    await expect(closeStaleSessions({ now: NOW })).resolves.toBe(1);
    expect(m.sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "IN_PROGRESS" },
      data: { status: "ABANDONED", finishedAt: ago(3 * HOUR - 90_000), durationMs: 90_000 },
    });
  });

  it("não mexe em sessão com resposta recente, mesmo que tenha começado há muito", async () => {
    m.sessionMany.mockResolvedValue([session("s2", 2 * HOUR, 5 * 60 * 1000)]);
    await expect(closeStaleSessions({ now: NOW })).resolves.toBe(0);
    expect(m.sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("sessão sem nenhuma resposta usa o início como última atividade", async () => {
    m.sessionMany.mockResolvedValue([session("s3", HOUR)]);
    await closeStaleSessions({ now: NOW });
    expect(m.sessionUpdateMany.mock.calls[0]?.[0].data).toMatchObject({ status: "ABANDONED", durationMs: 0 });
  });

  it("só considera sessões em andamento mais antigas que o limite, e pode restringir a certos alunos", async () => {
    m.sessionMany.mockResolvedValue([]);
    await closeStaleSessions({ now: NOW, studentIds: ["a", "b"] });
    const where = m.sessionMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ status: "IN_PROGRESS", studentId: { in: ["a", "b"] } });
    expect(where.startedAt.lt).toEqual(new Date(NOW.getTime() - STALE_AFTER_MS));

    m.sessionMany.mockClear();
    await closeStaleSessions({ now: NOW });
    expect(m.sessionMany.mock.calls[0]?.[0].where).not.toHaveProperty("studentId");
  });

  it("conclusão que aconteceu no meio (count 0) não é contada", async () => {
    m.sessionMany.mockResolvedValue([session("s4", 3 * HOUR, 3 * HOUR)]);
    m.sessionUpdateMany.mockResolvedValue({ count: 0 });
    await expect(closeStaleSessions({ now: NOW })).resolves.toBe(0);
  });

  it("limita a duração registrada ao teto", async () => {
    const day = 24 * HOUR;
    m.sessionMany.mockResolvedValue([session("s5", 2 * day, day / 2)]); // "jogou" 1,5 dia seguido
    await closeStaleSessions({ now: NOW });
    expect(m.sessionUpdateMany.mock.calls[0]?.[0].data.durationMs).toBe(MAX_SESSION_MS);
  });
});
