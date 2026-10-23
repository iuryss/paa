import { finishSession, MAX_SESSION_MS, recordAttempt, startSession, TelemetryError } from "./telemetry";

const m = {
  assignmentFindFirst: jest.fn(),
  profileFind: jest.fn(),
  sessionCreate: jest.fn(),
  sessionFind: jest.fn(),
  sessionUpdate: jest.fn(),
  attemptCreate: jest.fn(),
  userFind: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    assignment: { findFirst: (...a: unknown[]) => m.assignmentFindFirst(...a) },
    sensoryProfile: { findUnique: (...a: unknown[]) => m.profileFind(...a) },
    activitySession: {
      create: (...a: unknown[]) => m.sessionCreate(...a),
      findFirst: (...a: unknown[]) => m.sessionFind(...a),
      update: (...a: unknown[]) => m.sessionUpdate(...a),
    },
    attempt: { create: (...a: unknown[]) => m.attemptCreate(...a) },
    user: { findUnique: (...a: unknown[]) => m.userFind(...a) },
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

const openSession = {
  status: "IN_PROGRESS",
  maxHelpLevel: "NONE",
  activity: { module: "GRAFIA", content },
};

const attempt = {
  itemKey: "letra-a",
  optionId: "l-a",
  helpLevel: "NONE" as const,
  elapsedMs: 1500,
  attemptNo: 1,
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.attemptCreate.mockResolvedValue({});
  m.sessionUpdate.mockResolvedValue({});
});

describe("startSession", () => {
  it("abre sessão guardando o tema/modo usados no momento", async () => {
    m.assignmentFindFirst.mockResolvedValue({ id: "as1" });
    m.profileFind.mockResolvedValue({ theme: "FOCO", contentMode: "PICTOGRAFICO" });
    m.sessionCreate.mockResolvedValue({ id: "sess1" });

    await expect(startSession("stu1", "act1")).resolves.toEqual({ sessionId: "sess1" });
    expect(m.assignmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "stu1", activityId: "act1", activity: { published: true } } }),
    );
    expect(m.sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { studentId: "stu1", activityId: "act1", themeUsed: "FOCO", contentModeUsed: "PICTOGRAFICO" },
      }),
    );
  });

  it("recusa atividade que não está atribuída ao aluno", async () => {
    m.assignmentFindFirst.mockResolvedValue(null);
    await expect(startSession("stu1", "act1")).rejects.toMatchObject({ code: "not_found" });
    expect(m.sessionCreate).not.toHaveBeenCalled();
  });
});

describe("recordAttempt", () => {
  it("calcula o acerto no SERVIDOR e atualiza os contadores", async () => {
    m.sessionFind.mockResolvedValue(openSession);
    await expect(recordAttempt("stu1", "sess1", { ...attempt, helpLevel: "VERBAL_HINT" })).resolves.toEqual({
      correct: true,
    });
    expect(m.attemptCreate).toHaveBeenCalledWith({
      data: { sessionId: "sess1", itemKey: "letra-a", correct: true, helpLevel: "VERBAL_HINT", elapsedMs: 1500, attemptNo: 1 },
    });
    expect(m.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: {
        totalAttempts: { increment: 1 },
        correctCount: { increment: 1 },
        redirects: { increment: 0 },
        maxHelpLevel: "VERBAL_HINT",
      },
    });
  });

  it("resposta diferente conta como redirecionamento", async () => {
    m.sessionFind.mockResolvedValue(openSession);
    await expect(recordAttempt("stu1", "sess1", { ...attempt, optionId: "l-o" })).resolves.toEqual({
      correct: false,
    });
    expect(m.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correctCount: { increment: 0 }, redirects: { increment: 1 } }),
      }),
    );
  });

  it("mantém o maior nível de ajuda da sessão", async () => {
    m.sessionFind.mockResolvedValue({ ...openSession, maxHelpLevel: "VISUAL_HINT" });
    await recordAttempt("stu1", "sess1", { ...attempt, helpLevel: "VERBAL_HINT" });
    expect(m.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maxHelpLevel: "VISUAL_HINT" }) }),
    );
  });

  it("só encontra sessões do próprio aluno", async () => {
    m.sessionFind.mockResolvedValue(null);
    await expect(recordAttempt("outro-aluno", "sess1", attempt)).rejects.toMatchObject({ code: "not_found" });
    expect(m.sessionFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sess1", studentId: "outro-aluno" } }));
    expect(m.attemptCreate).not.toHaveBeenCalled();
  });

  it("recusa sessão já encerrada", async () => {
    m.sessionFind.mockResolvedValue({ ...openSession, status: "COMPLETED" });
    await expect(recordAttempt("stu1", "sess1", attempt)).rejects.toMatchObject({ code: "closed" });
  });

  it("recusa item ou opção que não existem na atividade", async () => {
    m.sessionFind.mockResolvedValue(openSession);
    await expect(recordAttempt("stu1", "sess1", { ...attempt, itemKey: "inexistente" })).rejects.toMatchObject({
      code: "invalid_item",
    });
    await expect(recordAttempt("stu1", "sess1", { ...attempt, optionId: "l-z" })).rejects.toMatchObject({
      code: "invalid_item",
    });
    expect(m.attemptCreate).not.toHaveBeenCalled();
  });

  it("recusa atividade com conteúdo corrompido", async () => {
    m.sessionFind.mockResolvedValue({ ...openSession, activity: { module: "GRAFIA", content: { items: [] } } });
    await expect(recordAttempt("stu1", "sess1", attempt)).rejects.toBeInstanceOf(TelemetryError);
  });
});

describe("finishSession", () => {
  const startedAt = new Date("2026-10-07T10:00:00Z");

  it("fecha a sessão com a duração calculada no servidor", async () => {
    m.sessionFind.mockResolvedValue({ status: "IN_PROGRESS", startedAt, durationMs: null });
    const now = new Date("2026-10-07T10:03:20Z");
    await expect(finishSession("stu1", "sess1", now)).resolves.toEqual({ durationMs: 200_000 });
    expect(m.sessionUpdate).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { status: "COMPLETED", finishedAt: now, durationMs: 200_000 },
    });
  });

  it("limita a duração (aba esquecida aberta)", async () => {
    m.sessionFind.mockResolvedValue({ status: "IN_PROGRESS", startedAt, durationMs: null });
    const now = new Date("2026-10-08T10:00:00Z");
    await expect(finishSession("stu1", "sess1", now)).resolves.toEqual({ durationMs: MAX_SESSION_MS });
  });

  it("é idempotente", async () => {
    m.sessionFind.mockResolvedValue({ status: "COMPLETED", startedAt, durationMs: 5000 });
    await expect(finishSession("stu1", "sess1")).resolves.toEqual({ durationMs: 5000 });
    expect(m.sessionUpdate).not.toHaveBeenCalled();
  });

  it("não fecha sessão de outro aluno", async () => {
    m.sessionFind.mockResolvedValue(null);
    await expect(finishSession("outro", "sess1")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("recordAttempt — Escrever o nome", () => {
  const nome = { items: [{ key: "nome", prompt: "Escreva seu nome", extraLetters: 3, letterCase: "MAIUSCULAS", showModel: true }] };
  const nameSession = { status: "IN_PROGRESS", maxHelpLevel: "NONE", activity: { module: "NOME", content: nome } };
  const place = (itemKey: string, optionId: string) => ({ ...attempt, itemKey, optionId });

  beforeEach(() => {
    m.sessionFind.mockResolvedValue(nameSession);
    m.userFind.mockResolvedValue({ displayName: "Ana" });
  });

  it("confere cada letra pelo apelido do aluno, no servidor (qualquer A serve no A)", async () => {
    await expect(recordAttempt("stu1", "sess1", place("letra-1", "c65-4"))).resolves.toEqual({ correct: true });
    await expect(recordAttempt("stu1", "sess1", place("letra-3", "c65-0"))).resolves.toEqual({ correct: true });
    await expect(recordAttempt("stu1", "sess1", place("letra-2", "c65-0"))).resolves.toEqual({ correct: false });
    expect(m.userFind).toHaveBeenCalledWith({ where: { id: "stu1" }, select: { displayName: true } });
    expect(m.attemptCreate.mock.calls[2]?.[0].data).toMatchObject({ itemKey: "letra-2", correct: false });
  });

  it("casa ou peça inexistente é recusada (não vira tentativa)", async () => {
    await expect(recordAttempt("stu1", "sess1", place("letra-9", "c65-0"))).rejects.toMatchObject({ code: "invalid_item" });
    await expect(recordAttempt("stu1", "sess1", place("letra-1", "l-a"))).rejects.toBeInstanceOf(TelemetryError);
    expect(m.attemptCreate).not.toHaveBeenCalled();
  });
});
