import { hashSecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { authenticateAdult, authenticateStudent } from "./authenticate";

const mockFind = jest.fn();
const mockInfo = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockFind(...a) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: (...a: unknown[]) => mockInfo(...a), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let adult: Record<string, unknown>;
let student: Record<string, unknown>;

beforeAll(async () => {
  adult = { id: "t1", role: "TEACHER", email: "prof@escola.com", displayName: "Profa", active: true, passwordHash: await hashSecret("Senha#Forte1") };
  student = { id: "s1", role: "STUDENT", displayName: "Sol", studentCode: "DEMO-2345", active: true, pinHash: await hashSecret("1234") };
});

beforeEach(async () => {
  mockFind.mockReset();
  mockInfo.mockReset();
  await loginLimiter.reset("adult:prof@escola.com");
  await loginLimiter.reset("student:DEMO-2345");
});

const creds = { email: "prof@escola.com", password: "Senha#Forte1" };
const sCreds = { studentCode: "DEMO-2345", pin: "1234" };

describe("o log de falha de login explica a razão (só no servidor)", () => {
  it.each([
    ["usuário inexistente", null, creds, "user_not_found"],
    ["senha errada", undefined, { ...creds, password: "errada" }, "wrong_password"],
    ["conta inativa", { active: false }, creds, "inactive"],
    ["função errada", { role: "STUDENT" }, creds, "wrong_role"],
  ])("adulto: %s → %s", async (_name, patch, input, reason) => {
    mockFind.mockResolvedValue(patch === null ? null : { ...adult, ...(patch ?? {}) });
    await expect(authenticateAdult(input)).resolves.toBeNull();
    expect(mockInfo).toHaveBeenCalledWith("auth.failed", { scope: "adult", reason });
  });

  it.each([
    ["usuário inexistente", null, sCreds, "user_not_found"],
    ["PIN errado", undefined, { ...sCreds, pin: "0000" }, "wrong_pin"],
    ["conta inativa", { active: false }, sCreds, "inactive"],
    ["função errada", { role: "TEACHER" }, sCreds, "wrong_role"],
  ])("aluno: %s → %s", async (_name, patch, input, reason) => {
    mockFind.mockResolvedValue(patch === null ? null : { ...student, ...(patch ?? {}) });
    await expect(authenticateStudent(input)).resolves.toBeNull();
    expect(mockInfo).toHaveBeenCalledWith("auth.failed", { scope: "student", reason });
  });

  it("o log não contém e-mail, senha, código nem PIN", async () => {
    mockFind.mockResolvedValue(null);
    await authenticateAdult({ email: "segredo@escola.com", password: "SenhaSecreta#1" });
    const logged = JSON.stringify(mockInfo.mock.calls);
    expect(logged).not.toContain("segredo@escola.com");
    expect(logged).not.toContain("SenhaSecreta");
  });

  it("login correto não registra falha", async () => {
    mockFind.mockResolvedValue(adult);
    await expect(authenticateAdult(creds)).resolves.toMatchObject({ id: "t1" });
    expect(mockInfo).not.toHaveBeenCalledWith("auth.failed", expect.anything());
  });
});
