import { legalContext } from "@/content/legal";
import { readEmailConfig } from "@/lib/email/config";
import { checkHealth } from "@/lib/health";
import { pingRedis, rateLimitBackend, type RateLimitBackend } from "@/lib/rate-limit";

export interface SystemCheck {
  id: string;
  label: string;
  status: "ok" | "warn";
  detail: string;
}

type Env = Record<string, string | undefined>;

interface Deps {
  env?: Env;
  backend?: RateLimitBackend;
  pingRedis?: () => Promise<boolean | null>;
  checkDb?: () => Promise<boolean>;
}

/**
 * Verificações de configuração para o painel "Verificação do sistema".
 * Mostra só o estado (ok/atenção) e dados públicos; nunca valores de segredos.
 */
export async function runSystemChecks({
  env = process.env,
  backend = rateLimitBackend,
  pingRedis: ping = pingRedis,
  checkDb = async () => (await checkHealth()).db,
}: Deps = {}): Promise<SystemCheck[]> {
  const production = env.NODE_ENV === "production";
  const checks: SystemCheck[] = [];
  const add = (id: string, label: string, ok: boolean, okText: string, warnText: string) =>
    checks.push({ id, label, status: ok ? "ok" : "warn", detail: ok ? okText : warnText });

  // Banco de dados
  const dbOk = await checkDb().catch(() => false);
  add("db", "Banco de dados", dbOk, "Conectado.", "Sem conexão com o banco. Confira a DATABASE_URL.");

  // Limite de tentativas de login
  if (backend === "redis") {
    const reachable = await ping();
    add(
      "rate-limit",
      "Limite de tentativas de login",
      reachable === true,
      "Redis (compartilhado entre todas as instâncias).",
      "Redis configurado, mas não respondeu. O sistema usa a memória como reserva (proteção reduzida). Confira as variáveis do Upstash.",
    );
  } else {
    add(
      "rate-limit",
      "Limite de tentativas de login",
      !production,
      "Em memória (suficiente em desenvolvimento).",
      "Em memória: não protege contra tentativas repetidas quando há várias instâncias (Vercel). Configure o Redis do Upstash.",
    );
  }

  // E-mail
  try {
    const config = readEmailConfig(env);
    const maskEmail = (e: string) => `${e.slice(0, 1)}***@${e.split("@")[1] ?? ""}`;
    const details: Record<string, string> = {
      console: "Modo terminal: o e-mail aparece no console do servidor e nada é enviado.",
      resend: "Resend configurado. Use “Enviar e-mail de teste” para confirmar.",
      gmail: `Gmail configurado${config.EMAIL_PROVIDER === "gmail" ? ` (${maskEmail(config.GMAIL_USER)})` : ""}. Use “Enviar e-mail de teste” para confirmar.`,
      smtp: `SMTP configurado${config.EMAIL_PROVIDER === "smtp" ? ` (${config.SMTP_HOST})` : ""}. Use “Enviar e-mail de teste” para confirmar.`,
    };
    add(
      "email",
      "Envio de e-mail",
      config.EMAIL_PROVIDER !== "console" || !production,
      details[config.EMAIL_PROVIDER] ?? "",
      "Configuração de e-mail inválida.",
    );
  } catch (error) {
    checks.push({ id: "email", label: "Envio de e-mail", status: "warn", detail: (error as Error).message });
  }

  // Endereço público (links dos e-mails)
  const authUrl = env.AUTH_URL;
  let urlDetail = "";
  let urlOk = false;
  if (!authUrl) {
    urlDetail = "AUTH_URL não definida: os links enviados por e-mail apontariam para localhost.";
  } else {
    try {
      const url = new URL(authUrl);
      urlOk = !production || url.protocol === "https:";
      urlDetail = urlOk ? url.origin : "Em produção a AUTH_URL precisa começar com https://.";
    } catch {
      urlDetail = "AUTH_URL inválida: precisa ser um endereço completo, como https://seu-dominio.com.br (sem aspas).";
    }
  }
  add("auth-url", "Endereço público (AUTH_URL)", urlOk, urlDetail, urlDetail);

  // Segredo de sessão
  add(
    "auth-secret",
    "Segredo de sessão (AUTH_SECRET)",
    (env.AUTH_SECRET?.length ?? 0) >= 32,
    "Definido.",
    "Ausente ou curto (mínimo 32 caracteres).",
  );

  // Textos legais
  const legal = legalContext(env);
  const missing = [!env.LEGAL_CONTROLLER_NAME?.trim() && "nome da escola", !env.LEGAL_DPO_EMAIL?.trim() && "e-mail do encarregado"].filter(Boolean);
  add(
    "legal",
    "Textos de privacidade e termo",
    legal.reviewed && missing.length === 0,
    "Revisados e com os dados da escola.",
    [
      !legal.reviewed && "ainda marcados como versão de trabalho (LEGAL_REVIEWED)",
      missing.length > 0 && `faltam: ${missing.join(" e ")}`,
    ]
      .filter(Boolean)
      .join("; ") + ".",
  );

  return checks;
}
