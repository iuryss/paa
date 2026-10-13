import { hashSecret, verifySecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { changePassword } from "./change-password";

const m = { find: jest.fn(), update: jest.fn(), audit: jest.fn() };

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => m.find(...a),
      update: (...a: unknown[]) => m.update(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));

let user: Record<string, unknown>;

beforeAll(async () => {
  user = { passwordHash: await hashSecret("senha-atual-123"), role: "TEACHER", active: true };
});

beforeEach(async () => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.update.mockResolvedValue({});
  m.audit.mockResolvedValue({});
  m.find.mockResolvedValue(user);
  await loginLimiter.reset("pwd:u1");
});

describe("changePassword", () => {
  it("troca a senha (novo hash) e audita sem gravar senhas", async () => {
    await expect(changePassword("u1", "senha-atual-123", "cavalo-azul-72")).resolves.toEqual({ ok: true });

    const data = m.update.mock.calls[0]?.[0].data;
    await expect(verifySecret("cavalo-azul-72", data.passwordHash)).resolves.toBe(true);
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "u1", action: "auth.password.change" } });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain("cavalo-azul-72");
  });

  it("recusa quando a senha atual não confere e não altera nada", async () => {
    await expect(changePassword("u1", "errada", "cavalo-azul-72")).resolves.toEqual({
      ok: false,
      code: "wrong_current",
    });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("bloqueia depois de 5 tentativas erradas, mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) await changePassword("u1", "errada", "cavalo-azul-72");
    await expect(changePassword("u1", "senha-atual-123", "cavalo-azul-72")).resolves.toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect(m.update).not.toHaveBeenCalled();
  });

  it.each([
    ["conta inativa", { active: false }],
    ["aluno", { role: "STUDENT" }],
    ["sem senha", { passwordHash: null }],
  ])("recusa %s", async (_name, patch) => {
    m.find.mockResolvedValue({ ...user, ...patch });
    await expect(changePassword("u1", "senha-atual-123", "cavalo-azul-72")).resolves.toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("usuário inexistente também é recusado", async () => {
    m.find.mockResolvedValue(null);
    await expect(changePassword("u1", "x", "cavalo-azul-72")).resolves.toMatchObject({ ok: false });
  });
});
