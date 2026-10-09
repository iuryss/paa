"use client";

import type { ReactNode } from "react";
import { useAccessibility } from "@/components/accessibility-provider";

interface AdaptiveLabelProps {
  text: string;
  /**
   * Pictograma do modo PECS, passado como elemento (ex.: `<Map />`), não como componente:
   * Server Components não podem enviar funções para Client Components.
   * Sem pictograma, o texto aparece sozinho em qualquer modo.
   */
  icon?: ReactNode;
}

/**
 * Modo Textual/Focal: só o texto.
 * Modo Pictográfico (PECS): pictograma grande + palavra curta embaixo (imagem e palavra juntas).
 */
export function AdaptiveLabel({ text, icon }: AdaptiveLabelProps) {
  const { prefs } = useAccessibility();

  if (prefs.contentMode === "pictografico" && icon) {
    return (
      <span className="inline-flex flex-col items-center gap-1" data-testid="pictogram-label">
        <span aria-hidden="true" className="block size-14 [&>svg]:size-full">
          {icon}
        </span>
        <span className="text-label">{text}</span>
      </span>
    );
  }
  return <span>{text}</span>;
}
