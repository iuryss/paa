import { readEmailConfig, type EmailConfig } from "./config";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailError extends Error {
  /** Status HTTP devolvido pelo provedor (ausente em falha de rede). */
  readonly status?: number;
  /** Nome do erro segundo o provedor (ex.: "validation_error"). Nunca contém a chave nem o corpo do e-mail. */
  readonly providerName?: string;

  constructor(message: string, details: { status?: number; providerName?: string } = {}) {
    super(message);
    this.name = "EmailError";
    this.status = details.status;
    this.providerName = details.providerName;
  }
}

interface SendOptions {
  config?: EmailConfig;
  fetchImpl?: typeof fetch;
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * Envia um e-mail transacional. Nunca registra o corpo (ele contém links de acesso) nem a chave.
 * Quem chama decide o que fazer em caso de falha; aqui só lançamos EmailError sem detalhes sensíveis.
 */
export async function sendEmail(
  message: EmailMessage,
  { config = readEmailConfig(), fetchImpl = fetch }: SendOptions = {},
): Promise<void> {
  if (config.EMAIL_PROVIDER === "console") {
    // Só dev/teste manual: o link aparece no terminal do servidor.
    console.log(`\n[e-mail simulado]\nPara: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
    return;
  }

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
    throw new EmailError("Falha de rede ao enviar e-mail");
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
    });
  }
}
