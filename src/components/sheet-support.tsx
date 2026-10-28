"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { Pictogram } from "@/components/pictogram";
import { ICON_LABEL } from "@/lib/activities/editor-model";
import type { SheetSupport } from "@/lib/validation/activities";

/**
 * "A **matéria** ocupa espaço" → texto com a palavra em destaque (como o negrito das folhas do caderno).
 * O destaque usa accent/on-accent (par de contraste testado) e também peso de fonte: cor nunca sozinha.
 */
export function withHighlights(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="rounded-[6px] bg-accent px-1 font-extrabold text-on-accent">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** Bloco de apoio no topo da folha: leitura, figura e exemplo resolvido. Fica visível em todos os exercícios. */
export function SheetSupportBlock({ sheet }: { sheet: SheetSupport }) {
  const uid = useId();
  if (!sheet.text && !sheet.icon && !sheet.example) return null;
  return (
    <section
      aria-labelledby={`${uid}-leia`}
      className="flex flex-col gap-6 rounded-[28px] border-2 border-border bg-surface p-6"
    >
      <h2 id={`${uid}-leia`} className="text-subtitle">
        Leia
      </h2>
      <div className="flex flex-col items-start gap-6 sm:flex-row">
        {sheet.icon ? (
          <span role="img" aria-label={ICON_LABEL[sheet.icon]} className="block size-20 shrink-0 text-ink">
            <Pictogram name={sheet.icon} />
          </span>
        ) : null}
        {sheet.text ? (
          <p className="max-w-[45ch] whitespace-pre-line text-leitura text-ink">{withHighlights(sheet.text)}</p>
        ) : null}
      </div>
      {sheet.example ? (
        <div className="flex flex-col gap-2 rounded-[20px] border-2 border-dashed border-border bg-surface-sunken p-4">
          <p className="text-label text-ink-muted">Exemplo</p>
          <p className="whitespace-pre-line text-body text-ink">{withHighlights(sheet.example)}</p>
        </div>
      ) : null}
    </section>
  );
}
