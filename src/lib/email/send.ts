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
  /** Código de resposta SMTP (ex.: 535). Ausente em falha de rede. */
  readonly status?: number;
  /** Código curto do nodemailer ("EAUTH", "ECONNECTION"...). Nunca contém senha nem o corpo do e-mail. */
  readonly providerName?: string;

  constructor(message: string, details: { status?: number; providerName?: string } = {}) {
    super(message);
    this.name = "EmailError";
    this.status = details.status;
    this.providerName = details.providerName;
  }
}

type Transport = Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail" | "close">;
type CreateTransport = (options: SMTPTransport.Options) => Transport;

interface SendOptions {
  config?: EmailConfig;
  /** Para testes. */
  createTransport?: CreateTransport;
}

const TIMEOUT_MS = 10_000;

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
    });
  } finally {
    transport.close();
  }
}

/**
 * Envia um e-mail transacional. Nunca registra o corpo (ele contém links de acesso) nem senhas.
 * Quem chama decide o que fazer em caso de falha; aqui só lançamos EmailError sem detalhes sensíveis.
 */
export async function sendEmail(
  message: EmailMessage,
  { config = readEmailConfig(), createTransport = nodemailer.createTransport as unknown as CreateTransport }: SendOptions = {},
): Promise<void> {
  if (config.EMAIL_PROVIDER === "console") {
    // Só dev/teste manual: o link aparece no terminal do servidor.
    console.log(`\n[e-mail simulado]\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  return sendViaSmtp(message, config, createTransport);
}
