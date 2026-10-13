import { verifySecret } from "@/lib/password";
import {
  acceptInvitation,
  emailInvitation,
  createInvitation,
  getInvitationPreview,
  INVITATION_TTL_MS,
} from "./invitations";
import { generateToken } from "./tokens";

const send = jest.fn();
jest.mock("@/lib/email/send", () => ({
  ...jest.requireActual("@/lib/email/send"),
  sendEmail: (...a: unknown[]) => send(...a),
}));

const m = {
  userFind: jest.fn(),
  userCreate: jest.fn(),
  invDeleteMany: jest.fn(),
  invCreate: jest.fn(),
  invFind: jest.fn(),
  invUpdateMany: jest.fn(),
  auditCreate: jest.fn(),
};

jest.mock("@/lib/db", () => {
  const client = {
    user: {
      findUnique: (...a: unknown[]) => m.userFind(...a),
      create: (...a: unknown[]) => m.userCreate(...a),
    },
    invitation: {
      deleteMany: (...a: unknown[]) => m.invDeleteMany(...a),
      create: (...a: unknown[]) => m.invCreate(...a),
      findUnique: (...a: unknown[]) => m.invFind(...a),
      updateMany: (...a: unknown[]) => m.invUpdateMany(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.auditCreate(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

const NOW = new Date("2026-10-08T12:00:00Z");
const input = { email: "ana@escola.com", displayName: "Ana", role: "TEACHER" as const };

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.auditCreate.mockResolvedValue({});
  m.invCreate.mockResolvedValue({});
  m.invDeleteMany.mockResolvedValue({ count: 0 });
});

describe("createInvitation", () => {
  it("cria convite de 7 dias e devolve o token só uma vez; no banco vai apenas o hash", async () => {
    m.userFind.mockResolvedValue(null);
    const result = await createInvitation("prof1", input, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt).toEqual(new Date(NOW.getTime() + INVITATION_TTL_MS));

    const data = m.invCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ email: "ana@escola.com", role: "TEACHER", displayName: "Ana", invitedById: "prof1" });
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain(result.token);
  });

  it("substitui convites pendentes do mesmo e-mail e audita sem gravar o e-mail", async () => {
    m.userFind.mockResolvedValue(null);
    await createInvitation("prof1", input, NOW);
    expect(m.invDeleteMany).toHaveBeenCalledWith({ where: { email: "ana@escola.com", usedAt: null } });
    expect(m.auditCreate).toHaveBeenCalledWith({ data: { actorId: "prof1", action: "invitation.create" } });
  });

  it("recusa e-mail que já tem conta", async () => {
    m.userFind.mockResolvedValue({ id: "u1" });
    await expect(createInvitation("prof1", input, NOW)).resolves.toEqual({ ok: false, code: "email_in_use" });
    expect(m.invCreate).not.toHaveBeenCalled();
  });
});

describe("getInvitationPreview", () => {
  const { token, hash } = generateToken();
  const valid = { displayName: "Ana", role: "TEACHER", expiresAt: new Date(NOW.getTime() + 1000), usedAt: null };

  it("mostra nome e função de um convite válido (procura pelo hash)", async () => {
    m.invFind.mockResolvedValue(valid);
    await expect(getInvitationPreview(token, NOW)).resolves.toEqual({ displayName: "Ana", role: "TEACHER" });
    expect(m.invFind).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hash } }));
  });

  it.each([
    ["inexistente", null],
    ["já usado", { ...valid, usedAt: NOW }],
    ["vencido", { ...valid, expiresAt: new Date(NOW.getTime() - 1) }],
    ["de função inválida", { ...valid, role: "STUDENT" }],
  ])("devolve null para convite %s", async (_name, row) => {
    m.invFind.mockResolvedValue(row);
    await expect(getInvitationPreview(token, NOW)).resolves.toBeNull();
  });

  it("nem consulta o banco se o token tem formato inválido", async () => {
    await expect(getInvitationPreview("../../etc/passwd", NOW)).resolves.toBeNull();
    expect(m.invFind).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  const { token } = generateToken();
  const invitation = {
    id: "inv1",
    email: "ana@escola.com",
    role: "THERAPIST",
    displayName: "Ana",
    expiresAt: new Date(NOW.getTime() + 1000),
    usedAt: null,
  };

  beforeEach(() => {
    m.invFind.mockResolvedValue(invitation);
    m.invUpdateMany.mockResolvedValue({ count: 1 });
    m.userFind.mockResolvedValue(null);
    m.userCreate.mockResolvedValue({ id: "novo" });
  });

  it("cria o usuário com a função do convite, senha em hash e perfil sensorial", async () => {
    await expect(acceptInvitation(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: true });

    const data = m.userCreate.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ role: "THERAPIST", email: "ana@escola.com", displayName: "Ana", sensoryProfile: { create: {} } });
    expect(data.passwordHash).not.toContain("cavalo-azul-72");
    await expect(verifySecret("cavalo-azul-72", data.passwordHash)).resolves.toBe(true);
    expect(m.invUpdateMany).toHaveBeenCalledWith({ where: { id: "inv1", usedAt: null }, data: { usedAt: NOW } });
    expect(m.auditCreate).toHaveBeenCalledWith({ data: { actorId: "novo", action: "invitation.accept" } });
  });

  it.each([
    ["inexistente", null],
    ["já usado", { ...invitation, usedAt: NOW }],
    ["vencido", { ...invitation, expiresAt: new Date(NOW.getTime() - 1) }],
    ["com função de aluno", { ...invitation, role: "STUDENT" }],
  ])("recusa convite %s sem criar usuário", async (_name, row) => {
    m.invFind.mockResolvedValue(row);
    await expect(acceptInvitation(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userCreate).not.toHaveBeenCalled();
  });

  it("dois cliques simultâneos: quem perde a disputa pelo convite não cria conta", async () => {
    m.invUpdateMany.mockResolvedValue({ count: 0 });
    await expect(acceptInvitation(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userCreate).not.toHaveBeenCalled();
  });

  it("recusa se o e-mail ganhou conta enquanto isso", async () => {
    m.userFind.mockResolvedValue({ id: "alguem" });
    await expect(acceptInvitation(token, "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.userCreate).not.toHaveBeenCalled();
  });

  it("token malformado nem chega ao banco", async () => {
    await expect(acceptInvitation("x", "cavalo-azul-72", NOW)).resolves.toEqual({ ok: false, code: "invalid" });
    expect(m.invFind).not.toHaveBeenCalled();
  });
});

describe("emailInvitation", () => {
  const args = { inviterId: "prof1", to: "ana@escola.com", name: "Ana", link: "https://app.exemplo.com/convite/tok" };

  beforeEach(() => send.mockReset());

  it("envia o convite com o nome de quem convidou e o link", async () => {
    m.userFind.mockResolvedValue({ displayName: "Beto" });
    send.mockResolvedValue(undefined);
    await expect(emailInvitation(args)).resolves.toBe(true);
    const mail = send.mock.calls[0]?.[0];
    expect(mail.to).toBe("ana@escola.com");
    expect(mail.text).toContain("Beto convidou você");
    expect(mail.text).toContain(args.link);
    expect(mail.text).toContain("7 dias");
  });

  it("se o envio falhar devolve false (o link continua sendo mostrado ao convidante)", async () => {
    m.userFind.mockResolvedValue({ displayName: "Beto" });
    send.mockRejectedValue(new Error("fora do ar"));
    await expect(emailInvitation(args)).resolves.toBe(false);
  });
});
