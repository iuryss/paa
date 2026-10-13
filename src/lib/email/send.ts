import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { readEmailConfig, smtpSettings, type EmailConfig } from "./config";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailError extends Error {
  /** HTTP (API do Resend) ou código de resposta SMTP (ex.: 535). Ausente em falha de rede. */
  readonly status?: number;
  /** Nome do erro segundo o provedor ("validation_error", "EAUTH"...). Nunca contém chave, senha nem o corpo do e-mail. */
  readonly providerName?: string;
  /** Por qual caminho o envio foi tentado. */
  readonly transport?: "http" | "smtp";

  constructor(
    message: string,
    details: { status?: number; providerName?: string; transport?: "http" | "smtp" } = {},
  ) {
    super(message);
    this.name = "EmailError";
    this.status = details.status;
    this.providerName = details.providerName;
    this.transport = details.transport;
  }
}

type Transport = Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail" | "close">;
type CreateTransport = (options: SMTPTransport.Options) => Transport;

interface SendOptions {
  config?: EmailConfig;
  fetchImpl?: typeof fetch;
  /** Para testes. */
  createTransport?: CreateTransport;
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

async function sendViaResend(
  message: EmailMessage,
  config: Extract<EmailConfig, { EMAIL_PROVIDER: "resend" }>,
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EmailError("Falha de rede ao enviar e-mail", { transport: "http" });
  }

  if (!response.ok) {
    // O Resend responde {"name": "...", "message": "...", "statusCode": N}. Guardamos só o nome do erro.
    let body: { name?: unknown } | null = null;
    try {
      body = (await response.json()) as { name?: unknown } | null;
    } catch {
      body = null; // corpo vazio ou não-JSON: seguimos só com o status
    }
    throw new EmailError(`O provedor de e-mail respondeu ${response.status}`, {
      status: response.status,
      providerName: typeof body?.name === "string" ? body.name.slice(0, 60) : undefined,
      transport: "http",
    });
  }
}

async function sendViaSmtp(
  message: EmailMessage,
  config: Extract<EmailConfig, { EMAIL_PROVIDER: "gmail" | "smtp" }>,
  createTransport: CreateTransport,
): Promise<void> {
  const s = smtpSettings(config);
  const transport = createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({
      from: s.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    // Só o código curto do nodemailer ("EAUTH", "ECONNECTION"...) e o número da resposta SMTP:
    // a mensagem completa pode citar usuário e servidor.
    const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
    throw new EmailError("Falha no envio por SMTP", {
      status: typeof responseCode === "number" ? responseCode : undefined,
      providerName: typeof code === "string" ? code.slice(0, 30) : undefined,
      transport: "smtp",
    });
  } finally {
    transport.close();
  }
}

/**
 * Envia um e-mail transacional. Nunca registra o corpo (ele contém links de acesso) nem chaves/senhas.
 * Quem chama decide o que fazer em caso de falha; aqui só lançamos EmailError sem detalhes sensíveis.
 */
export async function sendEmail(
  message: EmailMessage,
  { config = readEmailConfig(), fetchImpl = fetch, createTransport = nodemailer.createTransport as unknown as CreateTransport }: SendOptions = {},
): Promise<void> {
  switch (config.EMAIL_PROVIDER) {
    case "console":
      // Só dev/teste manual: o link aparece no terminal do servidor.
      console.log(`\n[e-mail simulado]\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
      return;
    case "resend":
      return sendViaResend(message, config, fetchImpl);
    case "gmail":
    case "smtp":
      return sendViaSmtp(message, config, createTransport);
  }
}
