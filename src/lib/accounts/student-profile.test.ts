import { saveStudentProfile } from "./student-profile";

const m = { guides: jest.fn(), find: jest.fn(), save: jest.fn(), audit: jest.fn() };

jest.mock("@/lib/dashboard/queries", () => ({ guidesStudent: (...a: unknown[]) => m.guides(...a) }));
jest.mock("@/lib/preferences", () => ({ savePreferences: (...a: unknown[]) => m.save(...a) }));
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => m.find(...a) },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));

const prefs = {
  theme: "foco",
  contentMode: "pictografico",
  font: "leitura",
  reducedMotion: true,
  soundEnabled: false,
} as const;

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.guides.mockResolvedValue(true);
  m.find.mockResolvedValue({ id: "stu1" });
  m.save.mockResolvedValue(undefined);
  m.audit.mockResolvedValue({});
});

describe("saveStudentProfile", () => {
  it("grava o perfil NO ALUNO (não no adulto) e audita", async () => {
    await expect(saveStudentProfile("prof1", "stu1", prefs)).resolves.toEqual({ ok: true });
    expect(m.save).toHaveBeenCalledWith("stu1", prefs);
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.profile.update", targetId: "stu1" },
    });
  });

  it("sem vínculo com o aluno não grava nada (LGPD)", async () => {
    m.guides.mockResolvedValue(false);
    await expect(saveStudentProfile("prof1", "stu-de-outro", prefs)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.save).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("só atua em aluno ativo", async () => {
    m.find.mockResolvedValue(null);
    await expect(saveStudentProfile("prof1", "stu1", prefs)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu1", role: "STUDENT", active: true } }),
    );
    expect(m.save).not.toHaveBeenCalled();
  });
});
