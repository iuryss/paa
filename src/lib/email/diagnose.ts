import { EmailError } from "./send";

export type EmailFailureCode =
  | "config"
  | "invalid_key"
  | "forbidden"
  | "invalid_from"
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

/** Traduz a falha de envio na causa mais provável e no que fazer. */
export function describeEmailFailure(error: unknown): EmailFailure {
  if (error instanceof EmailError) {
    const { status } = error;
    if (status === undefined) {
      return { code: "network", hint: "Não foi possível alcançar o provedor de e-mail (rede). Tente de novo em instantes." };
    }
    if (status === 401) {
      return { code: "invalid_key", status, hint: "O Resend recusou a chave. Confira se RESEND_API_KEY está correta, sem aspas nem espaços, e se não foi apagada no painel do Resend." };
    }
    if (status === 403) {
      return {
        code: "forbidden",
        status,
        hint: "O Resend recusou o envio. Confirme que o domínio do EMAIL_FROM está VERIFICADO no Resend (registros SPF e DKIM). Em modo de teste, o Resend só envia para o e-mail do dono da conta.",
      };
    }
    if (status === 422 || status === 400) {
      return { code: "invalid_from", status, hint: "O Resend não aceitou os dados. Confira o formato de EMAIL_FROM: Nome <endereco@seu-dominio-verificado.com.br>." };
    }
    if (status === 429) {
      return { code: "rate_limited", status, hint: "O limite de envios do plano do Resend foi atingido. Aguarde ou confira o plano." };
    }
    return { code: "provider_error", status, hint: `O Resend respondeu com erro (status ${status}). Veja os logs do servidor.` };
  }
  if (error instanceof Error && error.message.startsWith("Configuração de e-mail inválida")) {
    return { code: "config", hint: `${error.message}. Defina as variáveis no ambiente e faça um novo deploy.` };
  }
  return { code: "unknown", hint: "Falha inesperada ao enviar. Veja os logs do servidor." };
}
