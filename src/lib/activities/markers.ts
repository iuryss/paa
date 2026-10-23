/**
 * Marcadores das respostas: cada opção ganha uma cor e/ou forma geométrica, e as dicas apontam
 * para ela ("Procure o triângulo amarelo"). O marcador pertence à POSIÇÃO na tela (depois do
 * embaralhamento no servidor), nunca à resposta: assim "triângulo" não vira sinônimo de "certo".
 */

export const MARKER_STYLES = ["CORES_E_FORMAS", "FORMAS", "CORES"] as const;
export type MarkerStyle = (typeof MARKER_STYLES)[number];

export const DEFAULT_MARKER_STYLE: MarkerStyle = "CORES_E_FORMAS";

export const MARKER_STYLE_LABEL: Record<MarkerStyle, string> = {
  CORES_E_FORMAS: "Cores e formas",
  FORMAS: "Só formas",
  CORES: "Só cores",
};

export type MarkerShape = "circulo" | "triangulo" | "quadrado" | "estrela";
export type MarkerColor = "azul" | "amarelo" | "verde" | "roxo";

/** Uma vaga por posição (no máximo 4 opções por item). Cada forma tem sempre a mesma cor. */
const SLOTS: { shape: MarkerShape; color: MarkerColor; name: string; article: "o" | "a" }[] = [
  { shape: "circulo", color: "azul", name: "círculo azul", article: "o" },
  { shape: "triangulo", color: "amarelo", name: "triângulo amarelo", article: "o" },
  { shape: "quadrado", color: "verde", name: "quadrado verde", article: "o" },
  { shape: "estrela", color: "roxo", name: "estrela roxa", article: "a" },
];

const SHAPE_NAME: Record<MarkerShape, string> = {
  circulo: "círculo",
  triangulo: "triângulo",
  quadrado: "quadrado",
  estrela: "estrela",
};

export const MAX_MARKERS = SLOTS.length;

export interface Marker {
  shape: MarkerShape;
  /** null = forma sem cor (estilo FORMAS ou tema Foco Alto). */
  color: MarkerColor | null;
  /** Como a dica e o leitor de tela chamam o marcador: "triângulo amarelo", "cor azul". */
  name: string;
  article: "o" | "a";
}

/**
 * O tema Foco Alto é monocromático por princípio (o design system proíbe cor extra nele),
 * então lá os marcadores são sempre só formas, qualquer que seja a escolha do professor.
 */
export function resolveMarkerStyle(style: MarkerStyle, theme: string): MarkerStyle {
  return theme === "foco" ? "FORMAS" : style;
}

export function markerFor(position: number, style: MarkerStyle): Marker {
  const slot = SLOTS[position % SLOTS.length]!;
  if (style === "FORMAS") {
    const name = SHAPE_NAME[slot.shape];
    return { shape: slot.shape, color: null, name, article: slot.article };
  }
  if (style === "CORES") {
    // Mesma forma em todas as opções: o que separa é a cor, sempre dita por extenso na dica.
    return { shape: "circulo", color: slot.color, name: `cor ${slot.color}`, article: "a" };
  }
  return { shape: slot.shape, color: slot.color, name: slot.name, article: slot.article };
}

/** "Procure o triângulo amarelo." */
export function lookForText(marker: Marker): string {
  return `Procure ${marker.article} ${marker.name}.`;
}

/** "Toque no triângulo amarelo, que está em destaque." */
export function tapHighlightedText(marker: Marker): string {
  return `Toque n${marker.article} ${marker.name}, que está em destaque.`;
}
