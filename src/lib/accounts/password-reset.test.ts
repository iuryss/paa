import { verifySecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import {
  isResetTokenValid,
  requestPasswordReset,
  resetPassword,
  resetRequestLimiter,
  RESET_TTL_MS,
} from "./password-reset";
import { generateToken } from "./tokens";

const m = {
  userFind: jest.fn(),
  userUpdate: jest.fn(),
  prDeleteMany: jest.fn(),
  prCreate: jest.fn(),
  prFind: jest.fn(),
  prUpdateMany: jest.fn(),
  audit: jest.fn(),
  send: jest.fn(),
};

jest.mock("@/lib/email/send", () => ({
  ...jest.requireActual("@/lib/email/send"),
  sendEmail: (...a: unknown[]) => m.send(...a),
}));
jest.mock("@/lib/db", () => {
  const client = {
    user: {
      findUnique: (...a: unknown[]) => m.userFind(...a),
      update: (...a: unknown[]) => m.userUpdate(...a),
    },
    passwordReset: {
      deleteMany: (...a: unknown[]) => m.prDeleteMany(...a),
      create: (...a: unknown[]) => m.prCreate(...a),
      findUnique: (...a: unknown[]) => m.prFind(...a),
      updateMany: (...a: unknown[]) => m.prUpdateMany(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

const NOW = new Date("2026-10-08T12:00:00Z");
const BASE = "https://app.exemplo.com/";
const EMAIL = "ana@escola.com";
const user = { id: "u1", displayName: "Ana", role: "TEACHER", active: true };

beforeEach(async () => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.prDeleteMany.mockResolvedValue({ count: 0 });
  m.prCreate.mockResolvedValue({});
  m.audit.mockResolvedValue({});
  m.send.mockResolvedValue(undefined);
  await resetRequestLimiter.reset(`reset:${EMAIL}`);
  await loginLimiter.reset(`adult:${EMAIL}`);
});

describe("requestPasswordReset", () => {
  it("conta existente: cria token de 1 h, guarda só o hash e envia o link por e-mail", async () => {
    m.userFind.mockResolvedValue(user);
    await requestPasswordReset(EMAIL, BASE, NOW);

    const data = m.prCreate.mock.calls[0]?.[0].data;
    expect(data.userId).toBe("u1");
    expect(data.expiresAt).toEqual(new Date(NOW.getTime() + RESET_TTL_MS));
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.prDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });

    const mail = m.send.mock.calls[0]?.[0];
    expect(mail.to).toBe(EMAIL);
    const link = /https:\/\/app\.exemplo\.com\/redefinir-senha\/([A-Za-z0-9_-]{43})/.exec(mail.text);
    expect(link).not.toBeNull(); // sem barra dupla, vindo de AUTH_URL
    expect(JSON.stringify(data)).not.toContain(link![1]!); // o token em si não vai ao banco
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "u1", action: "auth.password.reset.request" } });
  });

  it.each([
    ["e-mail sem cadastro", null],
    ["conta inativa", { ...user, active: false }],
    ["aluno", { ...user, role: "STUDENT" }],
  ])("%s: não cria token nem envia e-mail (e não lança erro)", async (_name, row) => {
    m.userFind.mockResolvedValue(row);
    await expect(requestPasswordReset(EMAIL, BASE, NOW)).resolves.toBeUndefined();
    expect(m.prCreate).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("limita a 3 pedidos por hora por e-mail (anti-spam de caixa postal)", async () => {
    m.userFind.mockResolvedValue(user);
    for (let i = 0; i < 5; i++) await requestPasswordReset(EMAIL, BASE, NOW);
    expect(m.send).toHaveBeenCalledTimes(3);
  });

  it("o limite vale também para e-mails que não existem (não vira detector de contas)", async () => {
    m.userFind.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) await requestPasswordReset(EMAIL, BASE, NOW);
    expect(m.userFind).toHaveBeenCalledTimes(3);
  });

  it("falha no envio não propaga (a resposta ao usuário não pode mudar)", async () => {
    m.userFind.mockResolvedValue(user);
    m.send.mockRejectedValue(new Error("provedor fora do ar"));
    await expect(requestPasswordReset(EMAIL, BASE, NOW)).resolves.toBeUndefined();
  });

  it("registra a CAUSA da falha de envio no log, sem o endereço nem o link", async () => {
    const { EmailError } = jest.requireActual("@/lib/email/send");
    const { logger } = jest.requireActual("@/lib/logger");
    const spy = jest.spyOn(logger, "error").mockImplementation(() => {});
    m.userFind.mockResolvedValue(user);
    m.send.mockRejectedValue(new EmailError("x", { status: 403 }));
    await requestPasswordReset(EMAIL, BASE, NOW);
    expect(spy).toHaveBeenCalledWith("password_reset.email_failed", { code: "forbidden", status: 403 });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(EMAIL);
    spy.mockRestore();
  });
});

describe("isResetTokenValid", () => {
  const { token } = generateToken();
  const row = { expiresAt: new Date(NOW.getTime() + 1000), usedAt: null };

  it("válido, usado, vencido, inexistente e malformado", async () => {
    m.prFind.mockResolvedValue(row);
    await expect(isResetTokenValid(token, NOW)).resolves.toBe(true);
    m.prFind.mockResolvedValue({ ...row, usedAt: NOW });
    await expect(isResetTokenValid(token, NOW)).resolves.toBe(false);
    m.prFind.mockResolvedValue({ ...row, expiresAt: new Date(NOW.getTime() - 1) });
    await expect(isResetTokenValid(token, NOW)).resolves.toBe(false);
    m.prFind.mockResolvedValue(null);
    await expect(isResetTokenValid(token, NOW)).resolves.toBe(false);

    m.prFind.mockClear();
    await expect(isResetTokenValid("../x", NOW)).resolves.toBe(false);
    expect(m.prFind).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  const { token } = generateToken();
  const reset = { id: "r1", userId: "u1", expiresAt: new Date(NOW.getTime() + 1000), usedAt: null };

  beforeEach(() => {
    m.prFind.mockResolvedValue(reset);
    m.prUpdateMany.mockResolvedValue({ count: 1 });
    m.userFind.mockResolvedValue({ email: EMAIL, role: "TEACHER", active: true });
    m.userUpdate.mockResolvedValue({});
  });

  it("troca a senha (hash), consome o link, cancela os outros e libera o login bloqueado", async () => {
    for (let i = 0; i < 5; i++) await loginLimiter.fail(`adult:${EMAIL}`);
    expect(await loginLimiter.isBlocked(`adult:${EMAIL}`)).toBe(true);

    await expect(resetPassword(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: true });

    const data = m.userUpdate.mock.calls[0]?.[0].data;
    expect(data.passwordHash).not.toContain("cavalo-azul-72");
    await expect(verifySecret("cavalo-azul-72", data.passwordHash)).resolves.toBe(true);
    expect(m.prUpdateMany).toHaveBeenCalledWith({ where: { id: "r1", usedAt: null }, data: { usedAt: NOW } });
    expect(m.prDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1", usedAt: null } });
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "u1", action: "auth.password.reset" } });
    expect(await loginLimiter.isBlocked(`adult:${EMAIL}`)).toBe(false);
  });

  it.each([
    ["inexistente", null],
    ["já usado", { ...reset, usedAt: NOW }],
    ["vencido", { ...reset, expiresAt: new Date(NOW.getTime() - 1) }],
  ])("link %s: recusa sem tocar na senha", async (_name, row) => {
    m.prFind.mockResolvedValue(row);
    await expect(resetPassword(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it("dois cliques no mesmo link: quem perde a disputa não altera a senha", async () => {
    m.prUpdateMany.mockResolvedValue({ count: 0 });
    await expect(resetPassword(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["conta desativada", { email: EMAIL, role: "TEACHER", active: false }],
    ["aluno", { email: null, role: "STUDENT", active: true }],
  ])("recusa %s", async (_name, row) => {
    m.userFind.mockResolvedValue(row);
    await expect(resetPassword(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it("token malformado nem chega ao banco", async () => {
    await expect(resetPassword("x", "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.prFind).not.toHaveBeenCalled();
  });
});
