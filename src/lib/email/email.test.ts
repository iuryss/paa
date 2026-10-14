/** @jest-environment node */
import { readEmailConfig } from "./config";
import { sendEmail, type EmailMessage } from "./send";
import { escapeHtml, invitationEmail, passwordResetEmail, testEmail } from "./templates";

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

  it("em produção o padrão é o Gmail e exige as duas variáveis", () => {
    expect(() => readEmailConfig({ NODE_ENV: "production" })).toThrow(/GMAIL_USER.*GMAIL_APP_PASSWORD/);
    expect(
      readEmailConfig({ NODE_ENV: "production", GMAIL_USER: "plataforma@gmail.com", GMAIL_APP_PASSWORD: "abcdefghijklmnop" }),
    ).toMatchObject({ EMAIL_PROVIDER: "gmail" });
  });

  it("proíbe o provedor 'console' em produção", () => {
    expect(() => readEmailConfig({ NODE_ENV: "production", EMAIL_PROVIDER: "console" })).toThrow(/produção/);
  });

  it("rejeita provedor desconhecido (inclusive o antigo 'resend') e nunca ecoa a senha no erro", () => {
    expect(() => readEmailConfig({ EMAIL_PROVIDER: "sendgrid" })).toThrow(/EMAIL_PROVIDER/);
    expect(() => readEmailConfig({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_1234567890abcdef" })).toThrow(/EMAIL_PROVIDER/);
    try {
      readEmailConfig({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "curta" });
    } catch (e) {
      expect((e as Error).message).not.toContain("curta");
    }
  });
});

describe("sendEmail — modo console", () => {
  it("imprime o e-mail no terminal e não abre conexão alguma", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const createTransport = jest.fn();
    await sendEmail(message, { config: { EMAIL_PROVIDER: "console" }, createTransport });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ana@escola.com"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("redefinir-senha/TOKEN"));
    expect(createTransport).not.toHaveBeenCalled();
    log.mockRestore();
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

  it("e-mail de teste não contém link nem ação", () => {
    const mail = testEmail({ to: "ana@escola.com", name: "Ana" });
    expect(mail.subject).toContain("Teste");
    expect(mail.text).toContain("Nenhuma ação é necessária");
    expect(mail.text).not.toMatch(/https?:/);
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
