"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { Pictogram } from "@/components/pictogram";
import { UploadedImage } from "@/components/uploaded-image";
import { spokenMath } from "@/lib/activities/math";
import type { PlaceCard, PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

/** Área de soltar das telas de encaixar (exceto classificar, em que cada caixa é um alvo). */
export const DROP_ID = "alvo";

export type PieceProps = (tileId: string) => {
  describedBy: string;
  highlighted: boolean;
  onPlace: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
};

export function CardContent({ card, imageClass = "max-h-16" }: { card: PlaceCard; imageClass?: string }) {
  return (
    <>
      {card.image ? <UploadedImage image={card.image} className={cn(imageClass, "basis-full")} /> : null}
      <AdaptiveLabel text={card.label} icon={card.icon ? <Pictogram name={card.icon} /> : undefined} />
    </>
  );
}

/** Peça tocável, arrastável e acionável por teclado (Enter = colocar na próxima casa). */
export function Piece({
  id,
  name,
  disabled,
  highlighted,
  done,
  describedBy,
  onPlace,
  buttonRef,
  children,
}: {
  id: string;
  name: string;
  disabled: boolean;
  highlighted: boolean;
  done: boolean;
  describedBy: string;
  onPlace: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id, disabled });
  return (
    <button
      ref={(el) => {
        setNodeRef(el);
        buttonRef(el);
      }}
      type="button"
      data-piece={id}
      aria-label={`${spokenMath(name)}${highlighted ? ". Dica: esta" : ""}`}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onClick={onPlace}
      {...(disabled ? {} : listeners)}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "relative flex min-h-target flex-wrap items-center justify-center gap-2 rounded-[20px] border-2 px-5 py-2",
        "select-none touch-none text-button text-ink",
        done
          ? "border-success-border bg-success-bg text-success-ink"
          : highlighted
            ? "border-drop-active-border bg-drop-active-bg"
            : "border-border bg-surface",
        isDragging ? "z-10 shadow-lift" : "shadow-rest",
      )}
    >
      {children}
      {highlighted ? <Eye aria-hidden="true" className="size-6" strokeWidth={2.5} /> : null}
      {done ? <Check aria-hidden="true" className="size-6" strokeWidth={3} /> : null}
    </button>
  );
}

export function DropArea({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ID });
  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      role="group"
      className={cn(
        "rounded-[20px] border-2 border-dashed p-4",
        isOver ? "border-drop-active-border bg-drop-active-bg" : "border-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** As peças soltas. A usada deixa o lugar reservado: as outras não mudam de posição. */
export function PieceBank({
  item,
  label,
  placed,
  pieceProps,
}: {
  item: PlayItem;
  label: string;
  placed: string[];
  pieceProps: PieceProps;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-6">
      {item.place!.tiles.map((tile) =>
        placed.includes(tile.id) ? (
          <span
            key={tile.id}
            aria-hidden="true"
            className="invisible flex min-h-target items-center rounded-[20px] border-2 px-5 text-button"
          >
            {tile.label}
          </span>
        ) : (
          <Piece key={tile.id} id={tile.id} name={tile.label} disabled={false} done={false} {...pieceProps(tile.id)}>
            <CardContent card={tile} />
          </Piece>
        ),
      )}
    </div>
  );
}

