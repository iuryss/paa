import { addAdultToStudent, emailStudentShared, removeAdultFromStudent } from "./student-team";

const m = {
  guides: jest.fn(),
  findStudent: jest.fn(),
  findAdult: jest.fn(),
  createMany: jest.fn(),
  findLinks: jest.fn(),
  deleteLink: jest.fn(),
  audit: jest.fn(),
  lock: jest.fn(),
  send: jest.fn(),
};

jest.mock("@/lib/dashboard/queries", () => ({ guidesStudent: (...a: unknown[]) => m.guides(...a) }));
jest.mock("@/lib/email/send", () => ({
  EmailError: class EmailError extends Error {},
  sendEmail: (...a: unknown[]) => m.send(...a),
}));
jest.mock("@/lib/db", () => {
  const client = {
    user: {
      findFirst: (...a: unknown[]) => m.findStudent(...a),
      findUnique: (...a: unknown[]) => m.findAdult(...a),
    },
    guidance: {
      createMany: (...a: unknown[]) => m.createMany(...a),
      findMany: (...a: unknown[]) => m.findLinks(...a),
      delete: (...a: unknown[]) => m.deleteLink(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
    $queryRaw: (...a: unknown[]) => m.lock(...a),
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

const COLLEAGUE = { id: "prof2", displayName: "Bia", role: "THERAPIST", active: true };

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.guides.mockResolvedValue(true);
  m.findStudent.mockResolvedValue({ active: true });
  m.findAdult.mockResolvedValue(COLLEAGUE);
  m.createMany.mockResolvedValue({ count: 1 });
  m.findLinks.mockResolvedValue([{ adultId: "prof1" }, { adultId: "prof2" }]);
  m.deleteLink.mockResolvedValue({});
  m.audit.mockResolvedValue({});
  m.lock.mockResolvedValue([]);
  m.send.mockResolvedValue(undefined);
});

describe("addAdultToStudent", () => {
  it("vincula o colega e registra na auditoria", async () => {
    await expect(addAdultToStudent("prof1", "stu1", "bia@escola.test")).resolves.toEqual({
      ok: true,
      adult: { id: "prof2", displayName: "Bia", role: "THERAPIST", email: "bia@escola.test" },
    });
    expect(m.createMany).toHaveBeenCalledWith({ data: [{ adultId: "prof2", studentId: "stu1" }], skipDuplicates: true });
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof1", action: "student.team.add", targetId: "stu1", meta: { adultId: "prof2" } },
    });
  });

  it("quem não acompanha o aluno não adiciona ninguém, nem a si mesmo", async () => {
    m.guides.mockResolvedValue(false);
    await expect(addAdultToStudent("intruso", "stu1", "intruso@escola.test")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.findAdult).not.toHaveBeenCalled();
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it("com o consentimento revogado ninguém novo ganha acesso", async () => {
    m.findStudent.mockResolvedValue({ active: false });
    await expect(addAdultToStudent("prof1", "stu1", "bia@escola.test")).resolves.toEqual({ ok: false, code: "student_inactive" });
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["e-mail sem conta", null],
    ["conta desativada", { ...COLLEAGUE, active: false }],
    ["conta de aluno", { ...COLLEAGUE, role: "STUDENT" }],
  ])("%s → unknown_email", async (_name, adult) => {
    m.findAdult.mockResolvedValue(adult);
    await expect(addAdultToStudent("prof1", "stu1", "x@escola.test")).resolves.toEqual({ ok: false, code: "unknown_email" });
    expect(m.createMany).not.toHaveBeenCalled();
  });

  it("quem já acompanha não é duplicado nem gera auditoria", async () => {
    m.createMany.mockResolvedValue({ count: 0 });
    await expect(addAdultToStudent("prof1", "stu1", "bia@escola.test")).resolves.toEqual({ ok: false, code: "already_linked" });
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("removeAdultFromStudent", () => {
  it("todos são iguais: qualquer vinculado remove outro", async () => {
    await expect(removeAdultFromStudent("prof2", "stu1", "prof1")).resolves.toEqual({ ok: true });
    expect(m.deleteLink).toHaveBeenCalledWith({ where: { adultId_studentId: { adultId: "prof1", studentId: "stu1" } } });
    expect(m.audit).toHaveBeenCalledWith({
      data: { actorId: "prof2", action: "student.team.remove", targetId: "stu1", meta: { adultId: "prof1" } },
    });
  });

  it("sair do acompanhamento fica registrado como saída", async () => {
    await expect(removeAdultFromStudent("prof1", "stu1", "prof1")).resolves.toEqual({ ok: true });
    expect(m.audit.mock.calls[0]![0].data.action).toBe("student.team.leave");
  });

  it("o último adulto não sai: o aluno nunca fica sem ninguém", async () => {
    m.findLinks.mockResolvedValue([{ adultId: "prof1" }]);
    await expect(removeAdultFromStudent("prof1", "stu1", "prof1")).resolves.toEqual({ ok: false, code: "last_adult" });
    expect(m.deleteLink).not.toHaveBeenCalled();
  });

  it("bloqueia a linha do aluno antes de contar os vínculos", async () => {
    await removeAdultFromStudent("prof1", "stu1", "prof2");
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.findLinks.mock.invocationCallOrder[0]!);
  });

  it.each([
    ["quem pede não acompanha o aluno", "intruso", "prof1"],
    ["o adulto removido não está vinculado", "prof1", "prof9"],
  ])("%s → not_found", async (_name, actor, target) => {
    await expect(removeAdultFromStudent(actor, "stu1", target)).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.deleteLink).not.toHaveBeenCalled();
  });
});

describe("emailStudentShared", () => {
  const args = { actorId: "prof1", to: "bia@escola.test", name: "Bia", link: "https://x.test/professor" };

  it("avisa com o nome de quem adicionou e devolve true", async () => {
    m.findAdult.mockResolvedValue({ displayName: "Ana" });
    await expect(emailStudentShared(args)).resolves.toBe(true);
    expect(m.send.mock.calls[0]![0].text).toContain("Ana");
  });

  it("falha no envio não lança: o vínculo continua valendo", async () => {
    m.findAdult.mockResolvedValue({ displayName: "Ana" });
    m.send.mockRejectedValue(new Error("smtp"));
    await expect(emailStudentShared(args)).resolves.toBe(false);
  });
});
