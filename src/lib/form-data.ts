/**
 * Lê só os campos ESPERADOS de um formulário.
 * O Next/React acrescentam campos internos ($ACTION_REF_1, $ACTION_KEY...) quando o formulário é enviado
 * antes da página terminar de carregar o JavaScript (celular lento, JS desligado). Se a validação
 * recebesse tudo, um esquema estrito recusaria esses campos e a pessoa veria um erro técnico.
 */
export function pickFields<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Record<K, string | undefined> {
  const out = {} as Record<K, string | undefined>;
  for (const key of keys) {
    const value = formData.get(key);
    out[key] = typeof value === "string" ? value : undefined; // arquivos e campos ausentes viram undefined
  }
  return out;
}
