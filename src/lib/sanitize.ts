/** Remove caracteres de controle e tags HTML, normaliza espaços. Não substitui o escape do React. */
export function sanitizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\p{Cc}/gu, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
