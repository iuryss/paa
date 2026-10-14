/** @jest-environment node */
import { describeEmailFailure } from "./diagnose";
import { EmailError } from "./send";

describe("describeEmailFailure", () => {
  const smtp = (status: number | undefined, providerName?: string) => new EmailError("x", { status, providerName });

  it.each([
    [undefined, "EAUTH", "smtp_auth"],
    [535, undefined, "smtp_auth"],
    [534, undefined, "smtp_auth"],
    [undefined, "ETIMEDOUT", "network"],
    [undefined, "ECONNECTION", "network"],
    [undefined, "EDNS", "network"],
    [undefined, "ECONNREFUSED", "network"],
    [550, undefined, "smtp_recipient"],
    [553, undefined, "smtp_recipient"],
    [undefined, "EENVELOPE", "smtp_recipient"],
    [421, undefined, "rate_limited"],
    [454, undefined, "rate_limited"],
    [500, undefined, "provider_error"],
    [undefined, undefined, "provider_error"],
  ])("status=%s código=%s → %s", (status, code, expected) => {
    expect(describeEmailFailure(smtp(status as number | undefined, code)).code).toBe(expected);
  });

  it("a dica de login recusado explica a SENHA DE APP do Gmail", () => {
    const failure = describeEmailFailure(smtp(535, "EAUTH"));
    expect(failure.hint).toMatch(/SENHA DE APP de 16 letras/);
    expect(failure.hint).toMatch(/verificação em duas etapas/);
    expect(failure.status).toBe(535);
  });

  it("erro de configuração aponta as variáveis", () => {
    const failure = describeEmailFailure(new Error("Configuração de e-mail inválida. Verifique: GMAIL_USER, GMAIL_APP_PASSWORD"));
    expect(failure.code).toBe("config");
    expect(failure.hint).toContain("GMAIL_USER, GMAIL_APP_PASSWORD");
  });

  it("erro desconhecido não vaza detalhes", () => {
    const failure = describeEmailFailure(new Error("senha do banco: abc123"));
    expect(failure.code).toBe("unknown");
    expect(failure.hint).not.toContain("abc123");
  });
});
