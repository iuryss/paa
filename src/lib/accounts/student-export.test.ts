import { exportStudentData } from "./student-export";

const m = { guides: jest.fn(), find: jest.fn(), audit: jest.fn() };

jest.mock("@/lib/dashboard/queries", () => ({ guidesStudent: (...a: unknown[]) => m.guides(...a) }));
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => m.find(...a) },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));

const NOW = new Date("2026-10-09T12:00:00Z");
const d = (s: string) => new Date(s);

const student = {
  displayName: "Sol da Manhã",
  studentCode: "DEMO-2345",
  active: true,
  createdAt: d("2026-09-01T10:00:00Z"),
  sensoryProfile: { theme: "CALMO", contentMode: "TEXTUAL", fontFamily: "SANS", reducedMotion: true, soundEnabled: false },
  consents: [{ termsVersion: "2026.1", status: "GRANTED", createdAt: d("2026-09-01T10:00:00Z"), revokedAt: null }],
  assignments: [{ createdAt: d("2026-09-02T10:00:00Z"), activity: { title: "Letras", module: "GRAFIA" } }],
  sessions: [
    {
      startedAt: d("2026-10-01T10:00:00Z"),
      finishedAt: d("2026-10-01T10:01:30Z"),
      durationMs: 90_000,
      status: "COMPLETED",
      totalAttempts: 2,
      correctCount: 1,
      redirects: 1,
      maxHelpLevel: "VERBAL_HINT",
      themeUsed: "CALMO",
      contentModeUsed: "TEXTUAL",
      activity: { title: "Letras", module: "GRAFIA" },
      attempts: [
        { itemKey: "item-1", correct: false, helpLevel: "NONE", elapsedMs: 1800, attemptNo: 1, createdAt: d("2026-10-01T10:00:10Z") },
        { itemKey: "item-1", correct: true, helpLevel: "VERBAL_HINT", elapsedMs: 4200, attemptNo: 2, createdAt: d("2026-10-01T10:00:20Z") },
      ],
    },
  ],
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.guides.mockResolvedValue(true);
  m.find.mockResolvedValue(student);
  m.audit.mockResolvedValue({});
});

describe("exportStudentData", () => {
  it("reúne perfil, consentimentos, atribuições e todas as respostas do aluno", async () => {
    const result = await exportStudentData("prof1", "stu1", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.geradoEm).toBe(NOW.toISOString());
    expect(result.data.aluno).toMatchObject({ apelido: "Sol da Manhã", codigoDeAcesso: "DEMO-2345", ativo: true });
    expect(result.data.perfilSensorial).toMatchObject({ theme: "CALMO" });
    expect(result.data.consentimentos).toEqual([
      { versaoDoTermo: "2026.1", situacao: "GRANTED", registradoEm: "2026-09-01T10:00:00.000Z", revogadoEm: null },
    ]);
    expect(result.data.atividadesAtribuidas).toEqual([
      { atividade: "Letras", modulo: "GRAFIA", atribuidaEm: "2026-09-02T10:00:00.000Z" },
    ]);
    expect(result.data.sessoes[0]).toMatchObject({ tentativas: 2, acertos: 1, redirecionamentos: 1, maiorAjuda: "VERBAL_HINT" });
    expect(result.data.sessoes[0]!.respostas).toHaveLength(2);
    expect(result.data.sessoes[0]!.respostas[1]).toMatchObject({ item: "item-1", acertou: true, numeroDaTentativa: 2, tempoMs: 4200 });
  });

  it("NUNCA inclui o PIN nem o hash dele (a consulta nem seleciona esse campo)", async () => {
    const result = await exportStudentData("prof1", "stu1", NOW);
    const select = m.find.mock.calls[0]?.[0].select;
    expect(select).not.toHaveProperty("pinHash");
    expect(select).not.toHaveProperty("passwordHash");
    // Os campos secretos não aparecem no arquivo (o aviso em texto só explica que o PIN não é incluído).
    expect(JSON.stringify(result)).not.toMatch(/pinHash|passwordHash|"pin"/);
    expect(result.ok && result.data.observacao).toContain("O PIN de acesso não é incluído");
  });

  it("nome do arquivo seguro: sem acentos nem espaços, com a data", async () => {
    const result = await exportStudentData("prof1", "stu1", NOW);
    expect(result.ok && result.filename).toBe("dados-sol-da-manha-2026-10-09.json");
  });

  it("apelido esquisito vira nome de arquivo válido (sem path traversal)", async () => {
    m.find.mockResolvedValue({ ...student, displayName: "../../etc/passwd" });
    const result = await exportStudentData("prof1", "stu1", NOW);
    expect(result.ok && result.filename).toBe("dados-etc-passwd-2026-10-09.json");
  });

  it("audita cada exportação", async () => {
    await exportStudentData("prof1", "stu1", NOW);
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.export", targetId: "stu1" },
    });
  });

  it("sem vínculo: not_found, sem ler dados e sem auditar", async () => {
    m.guides.mockResolvedValue(false);
    await expect(exportStudentData("prof1", "stu-de-outro", NOW)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.find).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("o resultado é serializável em JSON", async () => {
    const result = await exportStudentData("prof1", "stu1", NOW);
    expect(() => JSON.parse(JSON.stringify(result.ok ? result.data : null))).not.toThrow();
  });
});
