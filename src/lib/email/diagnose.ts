import { EmailError } from "./send";

export type EmailFailureCode =
  | "config"
  | "smtp_auth"
  | "smtp_recipient"
  | "rate_limited"
  | "network"
  | "provider_error"
  | "unknown";

export interface EmailFailure {
  code: EmailFailureCode;
  status?: number;
  /** Explicação em português, segura para mostrar a um profissional logado (sem segredos). */
  hint: string;
}

const NETWORK_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ENOTFOUND", "ETLS", "EREQUIRETLS"]);

function describeSmtp(error: EmailError): EmailFailure {
  const { status, providerName: code } = error;

  if (code === "EAUTH" || status === 535 || status === 534 || status === 530) {
    return {
      code: "smtp_auth",
      status,
      hint: "O servidor de e-mail recusou o login. No Gmail, use a SENHA DE APP de 16 letras (não a senha normal da conta), com a verificação em duas etapas ligada, e confira GMAIL_USER. Em SMTP genérico, confira SMTP_USER e SMTP_PASS.",
    };
  }
  if (code && NETWORK_CODES.has(code)) {
    return { code: "network", status, hint: "Não foi possível conectar ao servidor de e-mail. Confira SMTP_HOST/SMTP_PORT (Gmail: nada a configurar) e tente de novo em instantes." };
  }
  if (code === "EENVELOPE" || status === 550 || status === 551 || status === 552 || status === 553) {
    return {
      code: "smtp_recipient",
      status,
      hint: "O servidor recusou o envio: o endereço do destinatário pode estar errado, ou o limite diário da conta foi atingido (Gmail gratuito: cerca de 500 e-mails por dia).",
    };
  }
  if (status === 421 || status === 450 || status === 451 || status === 452 || status === 454) {
    return { code: "rate_limited", status, hint: "O servidor de e-mail pediu para tentar mais tarde (limite temporário). Aguarde alguns minutos." };
  }
  return { code: "provider_error", status, hint: `O servidor de e-mail respondeu com erro${status ? ` (código ${status})` : ""}. Veja os logs do servidor.` };
}

/** Traduz a falha de envio na causa mais provável e no que fazer. */
export function describeEmailFailure(error: unknown): EmailFailure {
  if (error instanceof EmailError) return describeSmtp(error);
  if (error instanceof Error && error.message.startsWith("Configuração de e-mail inválida")) {
    return { code: "config", hint: `${error.message}. Defina as variáveis no ambiente e faça um novo deploy.` };
  }
  return { code: "unknown", hint: "Falha inesperada ao enviar. Veja os logs do servidor." };
}
