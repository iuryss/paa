import { randomInt } from "node:crypto";
import { STUDENT_CODE_REGEX } from "@/lib/validation/auth";

/** Sem 0/O/1/I para evitar confusão na leitura. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChars(n: number): string {
  return Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function generateStudentCode(): string {
  const code = `${randomChars(4)}-${randomChars(4)}`;
  if (!STUDENT_CODE_REGEX.test(code)) throw new Error("Código de aluno inválido gerado");
  return code;
}

export function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}
