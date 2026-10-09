import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("aceita configuração válida e aplica defaults", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejeita AUTH_SECRET curto", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "curto" })).toThrow(/AUTH_SECRET/);
  });

  it("rejeita DATABASE_URL que não seja postgresql://", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });

  it("não vaza o valor do segredo na mensagem de erro", () => {
    try {
      parseEnv({ ...valid, AUTH_SECRET: "segredo-curto" });
    } catch (e) {
      expect((e as Error).message).not.toContain("segredo-curto");
    }
  });
});
