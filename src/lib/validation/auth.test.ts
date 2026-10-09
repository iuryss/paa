import { adultLoginSchema, createStudentSchema, studentLoginSchema } from "./auth";

describe("adultLoginSchema", () => {
  it("normaliza e-mail (trim + minúsculas)", () => {
    const r = adultLoginSchema.parse({ email: "  Prof@Escola.COM ", password: "x" });
    expect(r.email).toBe("prof@escola.com");
  });

  it("rejeita e-mail inválido e senha vazia ou gigante", () => {
    expect(adultLoginSchema.safeParse({ email: "nao-e-email", password: "x" }).success).toBe(false);
    expect(adultLoginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(adultLoginSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success).toBe(
      false,
    );
  });

  it("rejeita tipos inesperados (objeto no lugar de string)", () => {
    expect(adultLoginSchema.safeParse({ email: { $ne: "" }, password: "x" }).success).toBe(false);
  });
});

describe("studentLoginSchema", () => {
  it("normaliza o código para maiúsculas", () => {
    const r = studentLoginSchema.parse({ studentCode: " demo-2345 ", pin: "1234" });
    expect(r.studentCode).toBe("DEMO-2345");
  });

  it.each(["12", "12345", "abcd", "12 4"])("rejeita PIN %p", (pin) => {
    expect(studentLoginSchema.safeParse({ studentCode: "DEMO-2345", pin }).success).toBe(false);
  });

  it.each(["DEMO2345", "DEM-12345", "DEMO-23", "DE;O-2345"])("rejeita código %p", (studentCode) => {
    expect(studentLoginSchema.safeParse({ studentCode, pin: "1234" }).success).toBe(false);
  });
});

describe("createStudentSchema", () => {
  const valid = { displayName: "Sol", guardianConsent: true, termsVersion: "2026-01" };

  it("aceita cadastro válido", () => {
    expect(createStudentSchema.safeParse(valid).success).toBe(true);
  });

  it("sanitiza HTML do apelido", () => {
    const r = createStudentSchema.parse({ ...valid, displayName: "<b>Sol</b>  Lua" });
    expect(r.displayName).toBe("Sol Lua");
  });

  it("recusa e-mail no apelido (zero PII)", () => {
    expect(createStudentSchema.safeParse({ ...valid, displayName: "ana@mail.com" }).success).toBe(
      false,
    );
  });

  it("exige consentimento explícito do responsável", () => {
    expect(createStudentSchema.safeParse({ ...valid, guardianConsent: false }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...valid, guardianConsent: "true" }).success).toBe(false);
  });

  it("bloqueia mass assignment (campos extras como role)", () => {
    expect(createStudentSchema.safeParse({ ...valid, role: "TEACHER" }).success).toBe(false);
  });
});
