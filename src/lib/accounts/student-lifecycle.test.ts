import { TERMS_VERSION } from "@/lib/terms";
import { deleteStudent, grantConsent, revokeConsent } from "./student-lifecycle";

const m = {
  guides: jest.fn(),
  find: jest.fn(),
  consentUpdateMany: jest.fn(),
  consentCreate: jest.fn(),
  userUpdate: jest.fn(),
  userDelete: jest.fn(),
  audit: jest.fn(),
};

jest.mock("@/lib/dashboard/queries", () => ({ guidesStudent: (...a: unknown[]) => m.guides(...a) }));
jest.mock("@/lib/db", () => {
  const client = {
    user: {
      findFirst: (...a: unknown[]) => m.find(...a),
      update: (...a: unknown[]) => m.userUpdate(...a),
      delete: (...a: unknown[]) => m.userDelete(...a),
    },
    consentRecord: {
      updateMany: (...a: unknown[]) => m.consentUpdateMany(...a),
      create: (...a: unknown[]) => m.consentCreate(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

const NOW = new Date("2026-10-09T12:00:00Z");

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.guides.mockResolvedValue(true);
  m.find.mockResolvedValue({ id: "stu1", displayName: "Sol" });
  [m.consentUpdateMany, m.consentCreate, m.userUpdate, m.userDelete, m.audit].forEach((fn) =>
    fn.mockResolvedValue({}),
  );
});

describe("sem vínculo com o aluno nada acontece (para todas as operações)", () => {
  beforeEach(() => m.guides.mockResolvedValue(false));

  it.each([
    ["revokeConsent", () => revokeConsent("prof1", "stu-de-outro", NOW)],
    ["grantConsent", () => grantConsent("prof1", "stu-de-outro")],
    ["deleteStudent", () => deleteStudent("prof1", "stu-de-outro", "Sol")],
  ])("%s → not_found e nenhuma escrita", async (_name, run) => {
    await expect(run()).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.userUpdate).not.toHaveBeenCalled();
    expect(m.userDelete).not.toHaveBeenCalled();
    expect(m.consentCreate).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("revokeConsent", () => {
  it("marca os consentimentos vigentes como REVOGADOS, desativa a conta e audita", async () => {
    await expect(revokeConsent("prof1", "stu1", NOW)).resolves.toEqual({ ok: true });

    expect(m.consentUpdateMany).toHaveBeenCalledWith({
      where: { studentId: "stu1", status: "GRANTED" },
      data: { status: "REVOKED", revokedAt: NOW },
    });
    expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "stu1" }, data: { active: false } });
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.consent.revoke", targetId: "stu1" },
    });
  });

  it("não apaga nada: os dados ficam retidos, sem uso", async () => {
    await revokeConsent("prof1", "stu1", NOW);
    expect(m.userDelete).not.toHaveBeenCalled();
  });
});

describe("grantConsent", () => {
  it("registra novo consentimento na versão atual do termo e reativa o acesso", async () => {
    await expect(grantConsent("prof1", "stu1")).resolves.toEqual({ ok: true });
    expect(m.consentCreate).toHaveBeenCalledWith({
      data: { studentId: "stu1", grantedBy: "prof1", termsVersion: TERMS_VERSION },
    });
    expect(m.userUpdate).toHaveBeenCalledWith({ where: { id: "stu1" }, data: { active: true } });
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.consent.grant", targetId: "stu1" },
    });
  });
});

describe("deleteStudent", () => {
  it("exclui quando o apelido digitado confere (ignora maiúsculas e espaços extras)", async () => {
    m.find.mockResolvedValue({ id: "stu1", displayName: "Sol Lua" });
    await expect(deleteStudent("prof1", "stu1", "  sol   LUA ")).resolves.toEqual({ ok: true });
    expect(m.userDelete).toHaveBeenCalledWith({ where: { id: "stu1" } });
  });

  it("grava a auditoria SEM nenhum dado do aluno, só o id", async () => {
    await deleteStudent("prof1", "stu1", "Sol");
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.delete", targetId: "stu1" },
    });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("Sol");
  });

  it("recusa confirmação errada e não apaga", async () => {
    await expect(deleteStudent("prof1", "stu1", "Outro")).resolves.toEqual({
      ok: false,
      code: "confirmation_mismatch",
    });
    await expect(deleteStudent("prof1", "stu1", "")).resolves.toEqual({
      ok: false,
      code: "confirmation_mismatch",
    });
    expect(m.userDelete).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("só apaga usuário com papel STUDENT", async () => {
    await deleteStudent("prof1", "stu1", "Sol");
    expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "stu1", role: "STUDENT" } }));
    m.find.mockResolvedValue(null);
    await expect(deleteStudent("prof1", "stu1", "Sol")).resolves.toEqual({ ok: false, code: "not_found" });
  });
});
