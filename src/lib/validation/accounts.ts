import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

/** Senhas óbvias que passariam só pelo tamanho. */
const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "qwertyuiop",
  "1q2w3e4r5t",
  "password123",
  "passw0rd123",
  "senha12345",
  "senha123456",
  "mudar12345",
  "abcdefghij",
  "professor123",
]);

/** Foco no tamanho (NIST SP 800-63B): 10+ caracteres, sem regras de composição que a pessoa contorna com "Senha1!". */
export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "Essa senha é muito comum. Escolha outra.")
  .refine((p) => new Set(p).size > 3, "Use uma senha com mais variedade de caracteres.");

export const INVITABLE_ROLES = ["TEACHER", "THERAPIST"] as const;

export const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
    displayName: z
      .string()
      .transform(sanitizeText)
      .pipe(z.string().min(2, "Informe o nome (mínimo 2 letras).").max(60, "Nome muito longo.")),
    role: z.enum(INVITABLE_ROLES),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: "As senhas não são iguais.",
    path: ["confirm"],
  });

/** Criar/redefinir senha por link: nova senha + confirmação. */
export const setPasswordSchema = acceptInvitationSchema;

export const forgotPasswordSchema = z
  .object({ email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254) })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual.").max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "A nova senha precisa ser diferente da atual.",
    path: ["newPassword"],
  });

export type InviteInput = z.infer<typeof inviteSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Primeira mensagem de erro de um parse, para mostrar à pessoa (todas as mensagens acima são seguras). */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
