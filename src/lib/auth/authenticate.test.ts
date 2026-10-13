import { hashSecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { authenticateAdult, authenticateStudent } from "./authenticate";

const mockFindUnique = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}));

let teacher: Record<string, unknown>;
let student: Record<string, unknown>;

beforeAll(async () => {
  teacher = {
    id: "t1",
    role: "TEACHER",
    email: "prof@escola.com",
    displayName: "Profa",
    active: true,
    passwordHash: await hashSecret("Senha#Forte1"),
  };
  student = {
    id: "s1",
    role: "STUDENT",
    displayName: "Sol",
    studentCode: "DEMO-2345",
    active: true,
    pinHash: await hashSecret("1234"),
  };
});

beforeEach(async () => {
  mockFindUnique.mockReset();
  mockAuditCreate.mockReset().mockResolvedValue({});
  await Promise.all(["adult:prof@escola.com", "student:DEMO-2345"].map((k) => loginLimiter.reset(k)));
});

describe("authenticateAdult", () => {
  const creds = { email: "Prof@Escola.com", password: "Senha#Forte1" };

  it("autentica credenciais válidas e registra auditoria", async () => {
    mockFindUnique.mockResolvedValue(teacher);
    await expect(authenticateAdult(creds)).resolves.toEqual({
      id: "t1",
      name: "Profa",
      role: "TEACHER",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: "prof@escola.com" } });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: { actorId: "t1", action: "auth.login" },
    });
  });

  it("rejeita senha errada", async () => {
    mockFindUnique.mockResolvedValue(teacher);
    await expect(authenticateAdult({ ...creds, password: "outra" })).resolves.toBeNull();
  });

  it("rejeita usuário inexistente (sem vazar diferença)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(authenticateAdult(creds)).resolves.toBeNull();
  });

  it("rejeita conta inativa", async () => {
    mockFindUnique.mockResolvedValue({ ...teacher, active: false });
    await expect(authenticateAdult(creds)).resolves.toBeNull();
  });

  it("não deixa um STUDENT entrar pelo login de adulto", async () => {
    mockFindUnique.mockResolvedValue({ ...teacher, role: "STUDENT" });
    await expect(authenticateAdult(creds)).resolves.toBeNull();
  });

  it("rejeita entrada malformada sem consultar o banco", async () => {
    await expect(authenticateAdult({ email: 1, password: [] })).resolves.toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("bloqueia após 5 falhas, mesmo com a senha certa", async () => {
    mockFindUnique.mockResolvedValue(teacher);
    for (let i = 0; i < 5; i++) {
      await authenticateAdult({ ...creds, password: "errada" });
    }
    await expect(authenticateAdult(creds)).resolves.toBeNull();
  });

  it("falha de auditoria não impede o login", async () => {
    mockFindUnique.mockResolvedValue(teacher);
    mockAuditCreate.mockRejectedValue(new Error("db off"));
    await expect(authenticateAdult(creds)).resolves.toMatchObject({ id: "t1" });
  });
});

describe("authenticateStudent", () => {
  const creds = { studentCode: "demo-2345", pin: "1234" };

  it("autentica código + PIN corretos", async () => {
    mockFindUnique.mockResolvedValue(student);
    await expect(authenticateStudent(creds)).resolves.toEqual({
      id: "s1",
      name: "Sol",
      role: "STUDENT",
    });
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { studentCode: "DEMO-2345" } });
  });

  it("rejeita PIN errado", async () => {
    mockFindUnique.mockResolvedValue(student);
    await expect(authenticateStudent({ ...creds, pin: "0000" })).resolves.toBeNull();
  });

  it("não deixa um adulto entrar pelo login de aluno", async () => {
    mockFindUnique.mockResolvedValue({ ...student, role: "TEACHER" });
    await expect(authenticateStudent(creds)).resolves.toBeNull();
  });

  it("bloqueia força bruta do PIN após 5 tentativas", async () => {
    mockFindUnique.mockResolvedValue(student);
    for (const pin of ["0001", "0002", "0003", "0004", "0005"]) {
      await authenticateStudent({ ...creds, pin });
    }
    await expect(authenticateStudent(creds)).resolves.toBeNull();
  });
});
