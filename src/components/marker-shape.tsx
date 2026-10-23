import type { Marker, MarkerColor, MarkerShape as Shape } from "@/lib/activities/markers";
import { cn } from "@/lib/utils";

const FILL: Record<MarkerColor, string> = {
  azul: "fill-marker-azul",
  amarelo: "fill-marker-amarelo",
  verde: "fill-marker-verde",
  roxo: "fill-marker-roxo",
};

const PATH: Record<Shape, string> = {
  circulo: "M24 5a19 19 0 1 1 0 38a19 19 0 1 1 0-38z",
  triangulo: "M24 5l20 36H4z",
  quadrado: "M7 7h34v34H7z",
  estrela: "M24 3l6.2 13.5 14.8 1.7-11 10 3 14.6L24 35.4 11 42.8l3-14.6-11-10 14.8-1.7z",
};

/**
 * Forma geométrica do marcador. Decorativa: o nome ("triângulo amarelo") vai em texto ao lado,
 * para o leitor de tela e para a regra "cor nunca sozinha". O contorno em `ink` garante 3:1.
 */
export function MarkerShape({ marker, className }: { marker: Marker; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      data-marker={marker.shape}
      className={cn("size-10 shrink-0", className)}
    >
      <path
        d={PATH[marker.shape]}
        strokeWidth={3}
        strokeLinejoin="round"
        className={cn("stroke-ink", marker.color ? FILL[marker.color] : "fill-surface-sunken")}
      />
    </svg>
  );
}
