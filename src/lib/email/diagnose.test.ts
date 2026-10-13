/** @jest-environment node */
import { describeEmailFailure } from "./diagnose";
import { EmailError, sendEmail } from "./send";

const resend = { EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_segredo_1234567890", EMAIL_FROM: "A <a@b.com>" } as const;
const mail = { to: "a@b.com", subject: "s", text: "t", html: "<p>t</p>" };

describe("sendEmail guarda o status e o nome do erro do provedor", () => {
  it("lê o nome do erro do corpo da resposta do Resend", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ name: "validation_error", message: "The domain is not verified", statusCode: 403 }),
    });
    const error = (await sendEmail(mail, { config: resend, fetchImpl }).catch((e: unknown) => e)) as EmailError;
    expect(error).toBeInstanceOf(EmailError);
    expect(error.status).toBe(403);
    expect(error.providerName).toBe("validation_error");
    expect(error.message).not.toContain("re_segredo"); // a chave nunca vai para o erro
  });

  it("corpo ilegível não atrapalha", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("html"); } });
    const error = (await sendEmail(mail, { config: resend, fetchImpl }).catch((e: unknown) => e)) as EmailError;
    expect(error.status).toBe(500);
    expect(error.providerName).toBeUndefined();
  });

  it("falha de rede não tem status", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const error = (await sendEmail(mail, { config: resend, fetchImpl }).catch((e: unknown) => e)) as EmailError;
    expect(error.status).toBeUndefined();
  });
});

describe("describeEmailFailure", () => {
  it.each([
    [401, "invalid_key", /RESEND_API_KEY/],
    [403, "forbidden", /domínio do EMAIL_FROM está VERIFICADO/],
    [422, "invalid_from", /EMAIL_FROM/],
    [400, "invalid_from", /EMAIL_FROM/],
    [429, "rate_limited", /limite de envios/],
    [500, "provider_error", /status 500/],
  ])("status %i → %s", (status, code, hint) => {
    const failure = describeEmailFailure(new EmailError("x", { status }));
    expect(failure.code).toBe(code);
    expect(failure.hint).toMatch(hint);
    expect(failure.status).toBe(status);
  });

  it("sem status é rede", () => {
    expect(describeEmailFailure(new EmailError("rede")).code).toBe("network");
  });

  it("erro de configuração aponta as variáveis", () => {
    const failure = describeEmailFailure(new Error("Configuração de e-mail inválida. Verifique: RESEND_API_KEY, EMAIL_FROM"));
    expect(failure.code).toBe("config");
    expect(failure.hint).toContain("RESEND_API_KEY, EMAIL_FROM");
  });

  it("erro desconhecido não vaza detalhes", () => {
    const failure = describeEmailFailure(new Error("senha do banco: abc123"));
    expect(failure.code).toBe("unknown");
    expect(failure.hint).not.toContain("abc123");
  });
});
