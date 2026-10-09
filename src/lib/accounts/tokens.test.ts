import { generateToken, hashToken, TOKEN_REGEX } from "./tokens";

describe("tokens", () => {
  it("gera token de 43 caracteres seguro para URL e hash SHA-256", () => {
    const { token, hash } = generateToken();
    expect(token).toMatch(TOKEN_REGEX);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
  });

  it("o hash não revela o token", () => {
    const { token, hash } = generateToken();
    expect(hash).not.toContain(token);
  });

  it("cada token é único", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken().token));
    expect(tokens.size).toBe(500);
  });

  it("rejeita formatos fora do padrão", () => {
    expect(TOKEN_REGEX.test("curto")).toBe(false);
    expect(TOKEN_REGEX.test("a".repeat(43) + "!")).toBe(false);
    expect(TOKEN_REGEX.test("../".repeat(15))).toBe(false);
  });
});
