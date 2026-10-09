import { z } from "zod";
import { sanitizeText } from "@/lib/sanitize";

/** Mensagens neutras: nunca revelam se o e-mail/código existe. */
export const adultLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const STUDENT_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const studentLoginSchema = z.object({
  studentCode: z.string().trim().toUpperCase().regex(STUDENT_CODE_REGEX),
  pin: z.string().regex(/^\d{4}$/),
});

/** Cadastro de aluno por professor/terapeuta. Zero PII: só apelido. `.strict()` bloqueia mass assignment. */
export const createStudentSchema = z
  .object({
    displayName: z
      .string()
      .transform(sanitizeText)
      .pipe(
        z
          .string()
          .min(2)
          .max(30)
          .refine((v) => !v.includes("@"), "Use apenas um apelido, sem e-mail."),
      ),
    guardianConsent: z.literal(true),
    termsVersion: z.string().regex(/^[\w.-]{1,20}$/),
  })
  .strict();

export type AdultLoginInput = z.infer<typeof adultLoginSchema>;
export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
