import { maskEmail, sendTestEmail, testEmailLimiter } from "./test-email";
import { EmailError } from "./send";

const m = { find: jest.fn(), audit: jest.fn(), send: jest.fn(), config: jest.fn() };

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => m.find(...a) },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
  },
}));
jest.mock("./send", () => ({
  ...jest.requireActual("./send"),
  sendEmail: (...a: unknown[]) => m.send(...a),
}));
jest.mock("./config", () => ({ readEmailConfig: () => m.config() }));

const user = { email: "ana.souza@escola.com", displayName: "Ana", role: "TEACHER", active: true };

beforeEach(async () => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.find.mockResolvedValue(user);
  m.audit.mockResolvedValue({});
  m.send.mockResolvedValue(undefined);
  m.config.mockReturnValue({ EMAIL_PROVIDER: "resend" });
  await testEmailLimiter.reset("u1");
});

describe("maskEmail", () => {
  it("esconde o usuário do e-mail", () => {
    expect(maskEmail("ana.souza@escola.com")).toBe("a***@escola.com");
  });
});

describe("sendTestEmail", () => {
  it("envia SÓ para o e-mail do próprio usuário e devolve o endereço mascarado", async () => {
    const result = await sendTestEmail("u1");
    expect(result).toEqual({ ok: true, maskedTo: "a***@escola.com", provider: "resend" });
    expect(m.send.mock.calls[0]?.[0]).toMatchObject({ to: "ana.souza@escola.com", subject: expect.stringContaining("Teste") });
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "u1", action: "email.test" } });
  });

  it("informa quando está no modo terminal (nada foi enviado de verdade)", async () => {
    m.config.mockReturnValue({ EMAIL_PROVIDER: "console" });
    await expect(sendTestEmail("u1")).resolves.toMatchObject({ ok: true, provider: "console" });
  });

  it("limita a 3 por hora por pessoa", async () => {
    for (let i = 0; i < 3; i++) await sendTestEmail("u1");
    await expect(sendTestEmail("u1")).resolves.toEqual({ ok: false, code: "rate_limited" });
    expect(m.send).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["conta inativa", { ...user, active: false }],
    ["sem e-mail (aluno)", { ...user, email: null, role: "STUDENT" }],
    ["inexistente", null],
  ])("recusa %s", async (_name, row) => {
    m.find.mockResolvedValue(row);
    await expect(sendTestEmail("u1")).resolves.toEqual({ ok: false, code: "forbidden" });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("falha do provedor vira dica em português, sem segredos nem o endereço", async () => {
    m.send.mockRejectedValue(new EmailError("x", { status: 403, providerName: "validation_error" }));
    const result = await sendTestEmail("u1");
    expect(result).toMatchObject({ ok: false, code: "send_failed", failure: { code: "forbidden", status: 403 } });
    expect(JSON.stringify(result)).not.toContain("ana.souza");
  });

  it("configuração ausente também é explicada", async () => {
    m.config.mockImplementation(() => {
      throw new Error("Configuração de e-mail inválida. Verifique: RESEND_API_KEY");
    });
    await expect(sendTestEmail("u1")).resolves.toMatchObject({ ok: false, code: "send_failed", failure: { code: "config" } });
  });
});
