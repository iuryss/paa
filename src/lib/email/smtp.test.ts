/** @jest-environment node */
import type { AddressInfo } from "node:net";
import { SMTPServer, type SMTPServerAuthentication } from "smtp-server";
import { describeEmailFailure } from "./diagnose";
import { readEmailConfig, smtpSettings, type EmailConfig } from "./config";
import { EmailError, sendEmail, type EmailMessage } from "./send";

const mail: EmailMessage = {
  to: "colega@escola.com",
  subject: "Redefinir sua senha",
  text: "Link: https://app.exemplo.com/redefinir-senha/TOKEN",
  html: "<p>Link: <a href='https://app.exemplo.com/redefinir-senha/TOKEN'>criar senha</a></p>",
};

describe("readEmailConfig — Gmail e SMTP", () => {
  const gmail = { GMAIL_USER: "plataforma.paa@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };

  it("Gmail precisa só de 2 variáveis e ignora os espaços da senha de app", () => {
    const config = readEmailConfig({ NODE_ENV: "production", EMAIL_PROVIDER: "gmail", ...gmail });
    expect(config).toMatchObject({ EMAIL_PROVIDER: "gmail", GMAIL_APP_PASSWORD: "abcdefghijklmnop" });
    expect(smtpSettings(config as Parameters<typeof smtpSettings>[0])).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "plataforma.paa@gmail.com",
      pass: "abcdefghijklmnop",
      from: "Plataforma TEA <plataforma.paa@gmail.com>",
    });
  });

  it("em produção descobre sozinho o provedor pelas variáveis presentes (e esquecer EMAIL_PROVIDER não quebra)", () => {
    expect(readEmailConfig({ NODE_ENV: "production", ...gmail }).EMAIL_PROVIDER).toBe("gmail");
    expect(readEmailConfig({ NODE_ENV: "production", SMTP_HOST: "smtp.escola.com", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "Plataforma <a@escola.com>" }).EMAIL_PROVIDER).toBe("smtp");
    expect(() => readEmailConfig({ NODE_ENV: "production" })).toThrow(/GMAIL_USER/); // nada configurado
  });

  it("EMAIL_FROM é opcional no Gmail (o padrão é a própria conta)", () => {
    const config = readEmailConfig({ EMAIL_PROVIDER: "gmail", ...gmail, EMAIL_FROM: "Escola Girassol <plataforma.paa@gmail.com>" });
    expect(smtpSettings(config as Parameters<typeof smtpSettings>[0]).from).toBe("Escola Girassol <plataforma.paa@gmail.com>");
  });

  it("senha de app curta, e-mail inválido e variável faltando são apontados pelo NOME, sem vazar valores", () => {
    expect(() => readEmailConfig({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "nao-e-email", GMAIL_APP_PASSWORD: "curta" })).toThrow(/GMAIL_USER.*GMAIL_APP_PASSWORD/);
    try {
      readEmailConfig({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "x@gmail.com", GMAIL_APP_PASSWORD: "segredo-curto" });
    } catch (e) {
      expect((e as Error).message).not.toContain("segredo-curto");
    }
  });

  it("SMTP genérico: porta 465 usa TLS direto; outras portas, STARTTLS automático; SMTP_SECURE força", () => {
    const base = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "Plataforma <a@b.com>" };
    const s = (extra: Record<string, string>) => smtpSettings(readEmailConfig({ ...base, ...extra }) as Parameters<typeof smtpSettings>[0]);
    expect(s({ SMTP_PORT: "465" }).secure).toBe(true);
    expect(s({ SMTP_PORT: "587" }).secure).toBe(false);
    expect(s({ SMTP_PORT: "2525", SMTP_SECURE: "true" }).secure).toBe(true);
    expect(() => readEmailConfig({ ...base, SMTP_PORT: "abc" })).toThrow(/SMTP_PORT/);
  });

  it("'console' continua proibido em produção", () => {
    expect(() => readEmailConfig({ NODE_ENV: "production", EMAIL_PROVIDER: "console" })).toThrow(/produção/);
  });
});

describe("sendEmail por SMTP — contra um servidor SMTP de verdade", () => {
  const received: { from: string; to: string[]; body: string; user: string }[] = [];
  let server: SMTPServer;
  let port: number;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: false,
      allowInsecureAuth: true,
      disabledCommands: ["STARTTLS"],
      onAuth(auth: SMTPServerAuthentication, _session, callback) {
        if (auth.username === "conta@gmail.test" && auth.password === "senha-de-app-correta") {
          callback(null, { user: auth.username });
        } else {
          callback(new Error("Invalid login"));
        }
      },
      onRcptTo(address, _session, callback) {
        if (address.address.startsWith("invalido")) {
          const error = Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 });
          return callback(error);
        }
        callback();
      },
      onData(stream, session, callback) {
        let body = "";
        stream.on("data", (c) => (body += c));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((r) => r.address),
            body,
            user: String(session.user ?? ""),
          });
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => (received.length = 0));

  const config = (over: Record<string, unknown> = {}) =>
    ({
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: port,
      SMTP_USER: "conta@gmail.test",
      SMTP_PASS: "senha-de-app-correta",
      SMTP_SECURE: "false",
      EMAIL_FROM: "Plataforma TEA <conta@gmail.test>",
      ...over,
    }) as unknown as EmailConfig;

  it("entrega o e-mail ao destinatário, com assunto, link no texto e no HTML", async () => {
    await sendEmail(mail, { config: config() });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ from: "conta@gmail.test", to: ["colega@escola.com"], user: "conta@gmail.test" });
    const body = received[0]!.body;
    expect(body).toContain("Subject: Redefinir sua senha");
    expect(body).toContain("From: Plataforma TEA <conta@gmail.test>");
    expect(body).toContain("https://app.exemplo.com/redefinir-senha/TOKEN");
    expect(body).toContain("Content-Type: text/html");
  });

  it("senha errada → EmailError 'smtp' com código EAUTH, traduzido para a senha de app", async () => {
    const error = (await sendEmail(mail, { config: config({ SMTP_PASS: "senha-errada" }) }).catch((e: unknown) => e)) as EmailError;
    expect(error).toBeInstanceOf(EmailError);
    expect(error.providerName).toBe("EAUTH");
    expect(error.message).not.toContain("senha-errada");

    const failure = describeEmailFailure(error);
    expect(failure.code).toBe("smtp_auth");
    expect(failure.hint).toMatch(/SENHA DE APP de 16 letras/);
    expect(received).toHaveLength(0);
  });

  it("destinatário recusado (550) → smtp_recipient", async () => {
    const error = (await sendEmail({ ...mail, to: "invalido@escola.com" }, { config: config() }).catch((e: unknown) => e)) as EmailError;
    expect(error).toBeInstanceOf(EmailError);
    expect(describeEmailFailure(error).code).toBe("smtp_recipient");
  });

  it("servidor inalcançável → rede, rápido e sem vazar a senha", async () => {
    const started = Date.now();
    const error = (await sendEmail(mail, { config: config({ SMTP_PORT: 1 }) }).catch((e: unknown) => e)) as EmailError;
    expect(error).toBeInstanceOf(EmailError);
    expect(describeEmailFailure(error).code).toBe("network");
    expect(JSON.stringify(error)).not.toContain("senha-de-app-correta");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("describeEmailFailure — SMTP", () => {
  const smtp = (status: number | undefined, providerName?: string) => new EmailError("x", { status, providerName });

  it.each([
    [undefined, "EAUTH", "smtp_auth"],
    [535, undefined, "smtp_auth"],
    [534, undefined, "smtp_auth"],
    [undefined, "ETIMEDOUT", "network"],
    [undefined, "ECONNECTION", "network"],
    [undefined, "EDNS", "network"],
    [550, undefined, "smtp_recipient"],
    [553, undefined, "smtp_recipient"],
    [undefined, "EENVELOPE", "smtp_recipient"],
    [421, undefined, "rate_limited"],
    [454, undefined, "rate_limited"],
    [500, undefined, "provider_error"],
  ])("status=%s código=%s → %s", (status, code, expected) => {
    expect(describeEmailFailure(smtp(status as number | undefined, code)).code).toBe(expected);
  });
});
