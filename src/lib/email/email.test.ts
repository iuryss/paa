/** @jest-environment node */
import { readEmailConfig } from "./config";
import { EmailError, sendEmail, type EmailMessage } from "./send";
import { escapeHtml, invitationEmail, passwordResetEmail } from "./templates";

const message: EmailMessage = {
  to: "ana@escola.com",
  subject: "Assunto",
  text: "Texto com https://app.exemplo.com/redefinir-senha/TOKEN",
  html: "<p>oi</p>",
};

describe("readEmailConfig", () => {
  it("em desenvolvimento o padrão é o provedor 'console'", () => {
    expect(readEmailConfig({ NODE_ENV: "development" })).toEqual({ EMAIL_PROVIDER: "console" });
    expect(readEmailConfig({ NODE_ENV: "test" })).toEqual({ EMAIL_PROVIDER: "console" });
  });

  it("em produção o padrão é 'resend' e exige chave e remetente", () => {
    expect(() => readEmailConfig({ NODE_ENV: "production" })).toThrow(/RESEND_API_KEY.*EMAIL_FROM/);
    expect(
      readEmailConfig({
        NODE_ENV: "production",
        RESEND_API_KEY: "re_1234567890abcdef",
        EMAIL_FROM: "Plataforma <nao-responda@escola.com.br>",
      }),
    ).toMatchObject({ EMAIL_PROVIDER: "resend" });
  });

  it("proíbe o provedor 'console' em produção", () => {
    expect(() => readEmailConfig({ NODE_ENV: "production", EMAIL_PROVIDER: "console" })).toThrow(/produção/);
  });

  it("rejeita provedor desconhecido e nunca ecoa a chave no erro", () => {
    expect(() => readEmailConfig({ EMAIL_PROVIDER: "sendgrid" })).toThrow(/EMAIL_PROVIDER/);
    try {
      readEmailConfig({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "curta" });
    } catch (e) {
      expect((e as Error).message).not.toContain("curta");
    }
  });
});

describe("sendEmail", () => {
  const resend = {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_segredo_1234567890",
    EMAIL_FROM: "Plataforma <nao-responda@escola.com.br>",
  } as const;

  it("console: imprime o e-mail no terminal e não faz requisição", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = jest.fn();
    await sendEmail(message, { config: { EMAIL_PROVIDER: "console" }, fetchImpl });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ana@escola.com"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("redefinir-senha/TOKEN"));
    expect(fetchImpl).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("resend: envia JSON com remetente, destinatário e chave no cabeçalho", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await sendEmail(message, { config: resend, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_segredo_1234567890");
    expect(JSON.parse(init.body)).toEqual({
      from: "Plataforma <nao-responda@escola.com.br>",
      to: ["ana@escola.com"],
      subject: "Assunto",
      text: message.text,
      html: message.html,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("resposta de erro do provedor vira EmailError sem vazar a chave nem o conteúdo", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    const error = await sendEmail(message, { config: resend, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailError);
    expect((error as Error).message).toContain("403");
    expect((error as Error).message).not.toContain("re_segredo");
    expect((error as Error).message).not.toContain("TOKEN");
  });

  it("falha de rede também vira EmailError genérico", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.resend.com"));
    const error = await sendEmail(message, { config: resend, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailError);
    expect((error as Error).message).toBe("Falha de rede ao enviar e-mail");
  });
});

describe("templates", () => {
  const link = "https://app.exemplo.com/redefinir-senha/abc_DEF-123";

  it("e-mail de redefinição: link no texto e no HTML, validade e aviso de segurança", () => {
    const mail = passwordResetEmail({ to: "ana@escola.com", name: "Ana", link, minutes: 60 });
    expect(mail.to).toBe("ana@escola.com");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.text).toContain("60 minutos");
    expect(mail.text).toContain("ignore este e-mail");
  });

  it("e-mail de convite: quem convidou, link e validade em dias", () => {
    const mail = invitationEmail({ to: "ana@escola.com", name: "Ana", inviterName: "Beto", link, days: 7 });
    expect(mail.text).toContain("Beto convidou você");
    expect(mail.text).toContain("7 dias");
    expect(mail.html).toContain(link);
  });

  it("escapa HTML em nomes e links (sem injeção no corpo do e-mail)", () => {
    const mail = passwordResetEmail({
      to: "x@y.com",
      name: '<img src=x onerror="alert(1)">',
      link: 'https://a.b/"><script>alert(1)</script>',
      minutes: 60,
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;img");
  });

  it("escapeHtml cobre os 5 caracteres especiais", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
