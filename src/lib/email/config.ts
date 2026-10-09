import { z } from "zod";

const schema = z.discriminatedUnion("EMAIL_PROVIDER", [
  /** Desenvolvimento: o e-mail aparece no terminal do servidor. Nada é enviado. */
  z.object({ EMAIL_PROVIDER: z.literal("console") }),
  z.object({
    EMAIL_PROVIDER: z.literal("resend"),
    RESEND_API_KEY: z.string().min(10),
    /** Ex.: "Plataforma TEA <nao-responda@suaescola.com.br>" (domínio verificado no Resend). */
    EMAIL_FROM: z.string().min(5),
  }),
]);

export type EmailConfig = z.infer<typeof schema>;

type Env = Record<string, string | undefined>;

/** Em produção o padrão é "resend" e o provedor "console" é proibido. Erros listam só os nomes das variáveis. */
export function readEmailConfig(env: Env = process.env): EmailConfig {
  const production = env.NODE_ENV === "production";
  const provider = env.EMAIL_PROVIDER ?? (production ? "resend" : "console");

  const parsed = schema.safeParse({
    EMAIL_PROVIDER: provider,
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
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
