import { z } from "zod";

/**
 * Provedores de e-mail:
 *  - console: desenvolvimento, o e-mail aparece no terminal do servidor (nada é enviado);
 *  - gmail:   gratuito, sem domínio próprio. Uma conta Gmail + "senha de app" (2 variáveis);
 *  - smtp:    qualquer servidor SMTP (escola, Outlook corporativo, Brevo...).
 */
const schema = z.discriminatedUnion("EMAIL_PROVIDER", [
  z.object({ EMAIL_PROVIDER: z.literal("console") }),
  z.object({
    EMAIL_PROVIDER: z.literal("gmail"),
    GMAIL_USER: z.string().trim().email(),
    /** A senha de app aparece como "abcd efgh ijkl mnop": os espaços são ignorados. */
    GMAIL_APP_PASSWORD: z
      .string()
      .transform((v) => v.replace(/\s+/g, ""))
      .pipe(z.string().min(16).max(64)),
    /** Opcional. O Gmail só envia "como" a própria conta, então o padrão é ela mesma. */
    EMAIL_FROM: z.string().min(5).optional(),
  }),
  z.object({
    EMAIL_PROVIDER: z.literal("smtp"),
    SMTP_HOST: z.string().trim().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    /** "true" = TLS direto (porta 465). Padrão: true só na 465 (nas outras o STARTTLS é automático). */
    SMTP_SECURE: z.enum(["true", "false"]).optional(),
    EMAIL_FROM: z.string().min(5),
  }),
]);

export type EmailConfig = z.infer<typeof schema>;
export type EmailProviderName = EmailConfig["EMAIL_PROVIDER"];

type Env = Record<string, string | undefined>;

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Converte as configurações "gmail" e "smtp" no mesmo formato de conexão. */
export function smtpSettings(config: Extract<EmailConfig, { EMAIL_PROVIDER: "gmail" | "smtp" }>): SmtpSettings {
  if (config.EMAIL_PROVIDER === "gmail") {
    return {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD,
      from: config.EMAIL_FROM ?? `Plataforma TEA <${config.GMAIL_USER}>`,
    };
  }
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE ? config.SMTP_SECURE === "true" : config.SMTP_PORT === 465,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.EMAIL_FROM,
  };
}

/** Em produção, sem EMAIL_PROVIDER, o sistema adivinha pelas variáveis presentes (e nunca usa "console"). */
function detectProvider(env: Env, production: boolean): string {
  const explicit = env.EMAIL_PROVIDER?.trim();
  if (explicit) return explicit;
  if (!production) return "console";
  if (env.SMTP_HOST) return "smtp";
  return "gmail";
}

/** Erros listam só os NOMES das variáveis, nunca os valores. */
export function readEmailConfig(env: Env = process.env): EmailConfig {
  const production = env.NODE_ENV === "production";

  const parsed = schema.safeParse({
    EMAIL_PROVIDER: detectProvider(env, production),
    EMAIL_FROM: env.EMAIL_FROM || undefined,
    GMAIL_USER: env.GMAIL_USER,
    GMAIL_APP_PASSWORD: env.GMAIL_APP_PASSWORD,
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: env.SMTP_PORT,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
    SMTP_SECURE: env.SMTP_SECURE || undefined,
  });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "EMAIL_PROVIDER"))];
    throw new Error(`Configuração de e-mail inválida. Verifique: ${fields.join(", ")}`);
  }
  if (production && parsed.data.EMAIL_PROVIDER === "console") {
    throw new Error("EMAIL_PROVIDER=console não pode ser usado em produção.");
  }
  return parsed.data;
}
