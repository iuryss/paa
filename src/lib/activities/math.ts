/**
 * Notação matemática escrita de um jeito natural pelo professor, sem linguagem especial:
 * `2^3` vira potência, `1/2` vira fração e `raiz(5)` (ou `√5`) vira raiz.
 * Tudo vira pedaços simples: a tela desenha e o leitor de tela fala ("2 elevado a 3").
 * E a comparação de respostas numéricas: 1/2, 0,5 e 2/4 são o mesmo número.
 */

export type MathPart =
  | { kind: "text"; text: string }
  | { kind: "power"; base: string; exponent: string }
  | { kind: "fraction"; top: string; bottom: string }
  | { kind: "root"; value: string };

// Só onde não há letra ou número colados antes: "metro^2" e "12/10/2026" continuam texto.
const MATH =
  /raiz\(([^()]{1,20})\)|√(\d+|\p{L})|(?<![\p{L}\d,./])(\d+|\p{L}|\([^()]{1,12}\))\^(-?\d+|\p{L})|(?<![\p{L}\d,./])(-?\d+)\/(\d+)(?![\d/])/gu;

export function parseMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined || m[2] !== undefined) parts.push({ kind: "root", value: (m[1] ?? m[2])! });
    else if (m[3] !== undefined) parts.push({ kind: "power", base: m[3], exponent: m[4]! });
    else parts.push({ kind: "fraction", top: m[5]!, bottom: m[6]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export const hasMath = (text: string) => parseMath(text).some((p) => p.kind !== "text");

const spokenNumber = (value: string) => value.replace(/^-/, "menos ");

/** Como o leitor de tela lê: "2 elevado a menos 3", "1 sobre 2", "raiz de 5". */
export function spokenMath(text: string): string {
  return parseMath(text)
    .map((p) => {
      if (p.kind === "power") return `${spokenNumber(p.base)} elevado a ${spokenNumber(p.exponent)}`;
      if (p.kind === "fraction") return `${spokenNumber(p.top)} sobre ${p.bottom}`;
      if (p.kind === "root") return `raiz de ${p.value}`;
      return p.text;
    })
    .join("");
}

/** "3", "-3", "0,5", "0.5", "1/8", "-2/4" → número. null se não for um número válido. */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  const fraction = /^(-?\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const bottom = Number(fraction[2]);
    return bottom === 0 ? null : Number(fraction[1]) / bottom;
  }
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/** Respostas equivalentes valem: 1/2 = 0,5 = 2/4. */
export function sameNumber(a: string, b: string): boolean {
  const x = parseNumber(a);
  const y = parseNumber(b);
  return x !== null && y !== null && Math.abs(x - y) < 1e-9;
}

/**
 * A resposta digitada vai para a telemetria como optionId, que só aceita [a-z0-9-]:
 * "-3" → "n-m3", "1/8" → "n-1s8", "0,5" → "n-0c5". null se tiver outros caracteres.
 */
export function encodeTyped(answer: string): string | null {
  const text = answer.trim().replace(".", ",");
  if (!/^[-\d,/]{1,12}$/.test(text)) return null;
  return `n-${text.replace(/-/g, "m").replace(/\//g, "s").replace(/,/g, "c")}`;
}

export function decodeTyped(optionId: string): string | null {
  if (!/^n-[msc\d]{1,12}$/.test(optionId)) return null;
  return optionId.slice(2).replace(/m/g, "-").replace(/s/g, "/").replace(/c/g, ",");
}
