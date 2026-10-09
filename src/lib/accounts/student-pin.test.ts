import { verifySecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { resetStudentPin } from "./student-pin";

const m = { guides: jest.fn(), find: jest.fn(), update: jest.fn(), audit: jest.fn() };

jest.mock("@/lib/dashboard/queries", () => ({ guidesStudent: (...a: unknown[]) => m.guides(...a) }));
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => m.find(...a),
      update: (...a: unknown[]) => m.update(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.guides.mockResolvedValue(true);
  m.find.mockResolvedValue({ studentCode: "DEMO-2345", displayName: "Sol" });
  m.update.mockResolvedValue({});
  m.audit.mockResolvedValue({});
  loginLimiter.reset("student:DEMO-2345");
});

describe("resetStudentPin", () => {
  it("gera PIN de 4 dígitos, grava só o hash e devolve o PIN uma vez", async () => {
    const result = await resetStudentPin("prof1", "stu1");
    expect(result).toMatchObject({ ok: true, studentCode: "DEMO-2345", displayName: "Sol" });
    if (!result.ok) return;

    expect(result.pin).toMatch(/^\d{4}$/);
    const data = m.update.mock.calls[0]?.[0].data;
    expect(data.pinHash).not.toContain(result.pin);
    await expect(verifySecret(result.pin, data.pinHash)).resolves.toBe(true);
    expect(m.update.mock.calls[0]?.[0].where).toEqual({ id: "stu1" });
  });

  it("audita sem gravar o PIN", async () => {
    const result = await resetStudentPin("prof1", "stu1");
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.pin.reset", targetId: "stu1" },
    });
    expect(result.ok && JSON.stringify(m.audit.mock.calls)).not.toContain(result.ok ? result.pin : "");
  });

  it("limpa o bloqueio de tentativas da criança", async () => {
    for (let i = 0; i < 5; i++) loginLimiter.fail("student:DEMO-2345");
    expect(loginLimiter.isBlocked("student:DEMO-2345")).toBe(true);
    await resetStudentPin("prof1", "stu1");
    expect(loginLimiter.isBlocked("student:DEMO-2345")).toBe(false);
  });

  it("sem vínculo com o aluno: not_found e nada é alterado (LGPD)", async () => {
    m.guides.mockResolvedValue(false);
    await expect(resetStudentPin("prof1", "stu-de-outro")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.find).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("só atua em usuário ativo com role STUDENT", async () => {
    await resetStudentPin("prof1", "stu1");
    expect(m.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stu1", role: "STUDENT", active: true } }),
    );
    m.find.mockResolvedValue(null);
    await expect(resetStudentPin("prof1", "stu1")).resolves.toEqual({ ok: false, code: "not_found" });
  });
});
