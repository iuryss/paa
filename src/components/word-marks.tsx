"use client";

import { Check, Eye } from "lucide-react";
import { MathText } from "@/components/math-text";
import { spokenMath } from "@/lib/activities/math";
import type { PlayOption } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

interface WordMarksProps {
  words: PlayOption[];
  found: string[];
  /** A palavra em destaque pela dica. */
  highlightedId?: string;
  done: boolean;
  onToggle: (id: string) => void;
}

/**
 * Marcar no texto ("circule no texto"): cada palavra é um botão, na ordem da frase.
 * As palavras têm a altura mínima de toque do projeto (64 px). O espaço entre elas é menor que os
 * 24 px dos outros alvos para o texto continuar sendo lido como texto.
 */
export function WordMarks({ words, found, highlightedId, done, onToggle }: WordMarksProps) {
  return (
    <div role="group" aria-label="Palavras do texto" className="flex w-full flex-wrap gap-x-2 gap-y-3">
      {words.map((word) => {
        const marked = found.includes(word.id);
        const highlighted = word.id === highlightedId;
        return (
          <button
            key={word.id}
            type="button"
            aria-label={`${spokenMath(word.label)}${highlighted ? ". Dica: esta palavra" : ""}`}
            aria-pressed={marked}
            aria-disabled={marked || done ? true : undefined}
            onClick={() => onToggle(word.id)}
            className={cn(
              "flex min-h-target select-none touch-manipulation items-center gap-1 rounded-[12px] border-2 px-3 text-leitura",
              marked
                ? "border-success-border bg-success-bg text-success-ink"
                : highlighted
                  ? "border-drop-active-border bg-drop-active-bg text-ink"
                  : "border-border-subtle bg-surface text-ink",
            )}
          >
            <MathText text={word.label} />
            {marked ? <Check aria-hidden="true" className="size-6" strokeWidth={3} /> : null}
            {highlighted ? <Eye aria-hidden="true" className="size-6" strokeWidth={2.5} /> : null}
          </button>
        );
      })}
    </div>
  );
}
