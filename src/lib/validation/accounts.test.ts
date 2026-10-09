import {
  acceptInvitationSchema,
  changePasswordSchema,
  firstIssue,
  inviteSchema,
  passwordSchema,
} from "./accounts";

describe("passwordSchema", () => {
  it("aceita senha de 10+ caracteres com variedade", () => {
    expect(passwordSchema.safeParse("cavalo-azul-72").success).toBe(true);
  });

  it.each([
    ["curta demais", "abc123"],
    ["comum", "1234567890"],
    ["comum em maiúsculas", "PASSWORD123"],
    ["sem variedade", "aaaaaaaaaaaa"],
    ["longa demais", "x1".repeat(70)],
  ])("rejeita senha %s", (_name, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it("dá mensagem em português, sem revelar a senha", () => {
    const r = passwordSchema.safeParse("curta");
    expect(!r.success && firstIssue(r.error)).toBe("A senha precisa ter pelo menos 10 caracteres.");
  });
});

describe("inviteSchema", () => {
  const valid = { email: " Ana@Escola.com ", displayName: "<b>Ana</b> Souza", role: "THERAPIST" };

  it("normaliza e-mail e sanitiza o nome", () => {
    expect(inviteSchema.parse(valid)).toEqual({
      email: "ana@escola.com",
      displayName: "Ana Souza",
      role: "THERAPIST",
    });
  });

  it("só permite convidar professor ou terapeuta (nunca STUDENT)", () => {
    expect(inviteSchema.safeParse({ ...valid, role: "STUDENT" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...valid, role: "ADMIN" }).success).toBe(false);
  });

  it("rejeita e-mail inválido, nome curto e campos extras", () => {
    expect(inviteSchema.safeParse({ ...valid, email: "sem-arroba" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...valid, displayName: "A" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...valid, active: true }).success).toBe(false);
  });
});

describe("acceptInvitationSchema", () => {
  it("exige as duas senhas iguais", () => {
    const r = acceptInvitationSchema.safeParse({ password: "cavalo-azul-72", confirm: "cavalo-azul-73" });
    expect(!r.success && firstIssue(r.error)).toBe("As senhas não são iguais.");
    expect(acceptInvitationSchema.safeParse({ password: "cavalo-azul-72", confirm: "cavalo-azul-72" }).success).toBe(true);
  });

  it("aplica a política de senha", () => {
    expect(acceptInvitationSchema.safeParse({ password: "curta", confirm: "curta" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("exige senha nova diferente da atual", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "cavalo-azul-72", newPassword: "cavalo-azul-72" });
    expect(!r.success && firstIssue(r.error)).toBe("A nova senha precisa ser diferente da atual.");
  });

  it("aceita troca válida e rejeita campos extras", () => {
    const ok = { currentPassword: "antiga", newPassword: "cavalo-azul-72" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, role: "TEACHER" }).success).toBe(false);
  });
});
