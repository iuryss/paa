"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye } from "lucide-react";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { Pictogram } from "@/components/pictogram";
import { CardContent, DropArea, PieceBank, type PieceProps } from "@/components/place-pieces";
import { UploadedImage } from "@/components/uploaded-image";
import { ICON_LABEL } from "@/lib/activities/editor-model";
import type { PlaceCard, PlacePlay, PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

interface BoardProps {
  item: PlayItem;
  placed: string[];
  current: number;
  pieceProps: PieceProps;
}

const slotState = (filled: boolean, isCurrent: boolean) => (filled ? "preenchida" : isCurrent ? "atual" : "vazia");

const slotClass = (filled: boolean, isCurrent: boolean) =>
  filled
    ? "border-success-border bg-success-bg text-success-ink"
    : isCurrent
      ? "border-dashed border-drop-active-border bg-drop-active-bg text-ink"
      : "border-dashed border-drop-border bg-drop-bg text-ink";

/** Ordenar: letras lado a lado, palavras formando a frase ou passos numerados, uma posição por vez. */
export function OrderBoard({ item, placed, current, pieceProps }: BoardProps) {
  const place = item.place!;
  const label = (id: string | undefined) => place.tiles.find((t) => t.id === id)?.label;
  const steps = place.order === "passos";
  return (
    <div className="flex w-full flex-col gap-12">
      <DropArea label="Ordem certa">
        <ol className={cn("flex gap-3", steps ? "flex-col" : "flex-wrap justify-center")}>
          {place.slots.map((_, i) => {
            const text = label(placed[i]);
            const isCurrent = i === current;
            return (
              <li
                key={i}
                data-order={i + 1}
                data-state={slotState(Boolean(text), isCurrent)}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] border-2 px-3",
                  place.order === "letras" ? "size-16 justify-center px-0 font-letra text-title" : "min-h-16 min-w-[6ch] text-button",
                  slotClass(Boolean(text), isCurrent),
                )}
              >
                {steps ? <span aria-hidden="true" className="text-label">{i + 1}.</span> : null}
                <span aria-hidden="true">{text ?? ""}</span>
                <span className="sr-only">{`Posição ${i + 1}: ${text ?? (isCurrent ? "a próxima" : "vazia")}`}</span>
              </li>
            );
          })}
        </ol>
      </DropArea>
      <PieceBank item={item} label="Peças" placed={placed} pieceProps={pieceProps} />
    </div>
  );
}

/** Nomear imagens: cada figura com a sua casa embaixo; a figura da vez fica destacada. */
export function FiguresBoard({ item, placed, current, pieceProps }: BoardProps) {
  const place = item.place!;
  const label = (id: string | undefined) => place.tiles.find((t) => t.id === id)?.label;
  return (
    <div className="flex w-full flex-col gap-12">
      <DropArea label="Figuras para nomear">
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {place.figures!.map((figure, i) => {
            const word = label(placed[i]);
            const isCurrent = i === current;
            return (
              <li key={i} data-figure={i + 1} data-state={slotState(Boolean(word), isCurrent)} className="flex flex-col items-center gap-3">
                {figure.image ? (
                  <UploadedImage image={figure.image} className="max-h-28" />
                ) : figure.icon ? (
                  <span role="img" aria-label={ICON_LABEL[figure.icon]} className="block size-20 text-ink">
                    <Pictogram name={figure.icon} />
                  </span>
                ) : null}
                <span
                  className={cn(
                    "flex min-h-12 w-full items-center justify-center rounded-[12px] border-2 px-2 text-button",
                    slotClass(Boolean(word), isCurrent),
                  )}
                >
                  <span aria-hidden="true">{word ?? ""}</span>
                  <span className="sr-only">{`Nome da figura ${i + 1}: ${word ?? (isCurrent ? "a próxima" : "vazio")}`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </DropArea>
      <PieceBank item={item} label="Palavras" placed={placed} pieceProps={pieceProps} />
    </div>
  );
}

/** O cartão da vez: dá para arrastar até a caixa (tocar na caixa faz o mesmo). */
function CurrentCard({ card, index, total }: { card: PlaceCard; index: number; total: number }) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id: "cartao" });
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-label text-ink-muted">
        Cartão {index + 1} de {total}
      </p>
      <div
        ref={setNodeRef}
        {...listeners}
        data-card="atual"
        style={{ transform: CSS.Translate.toString(transform) }}
        className={cn(
          "relative flex min-h-target-lg min-w-40 cursor-grab flex-wrap items-center justify-center gap-2 rounded-[20px] border-2 border-dashed",
          "select-none touch-none border-drop-active-border bg-drop-active-bg px-6 py-3 text-button text-ink",
          isDragging ? "z-10 shadow-lift" : "shadow-rest",
        )}
      >
        <CardContent card={card} imageClass="max-h-24" />
      </div>
    </div>
  );
}

/** Caixa: alvo de soltar e botão ao mesmo tempo. Os cartões guardados ficam visíveis dentro dela. */
function Box({
  group,
  cards,
  disabled,
  props,
}: {
  group: PlacePlay["tiles"][number];
  cards: PlaceCard[];
  disabled: boolean;
  props: ReturnType<PieceProps>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-3 rounded-[20px] border-2 p-3",
        isOver || props.highlighted ? "border-drop-active-border bg-drop-active-bg" : "border-border bg-surface",
      )}
    >
      <button
        ref={props.buttonRef}
        type="button"
        data-box={group.id}
        aria-label={`Caixa ${group.label}${props.highlighted ? ". Dica: esta" : ""}`}
        aria-describedby={props.describedBy}
        aria-disabled={disabled || undefined}
        onClick={props.onPlace}
        className="flex min-h-target w-full flex-wrap items-center justify-center gap-2 rounded-[12px] border-2 border-border bg-surface-sunken px-3 py-2 text-button text-ink"
      >
        {group.image ? <UploadedImage image={group.image} className="max-h-16 basis-full" /> : null}
        <AdaptiveLabel text={group.label} icon={group.icon ? <Pictogram name={group.icon} /> : undefined} />
        {props.highlighted ? <Eye aria-hidden="true" className="size-6" strokeWidth={2.5} /> : null}
      </button>
      <ul aria-label={`Guardados em ${group.label}`} className="flex min-h-12 flex-wrap gap-2">
        {cards.map((card, i) => (
          <li key={i} className="flex items-center gap-1 rounded-[12px] border-2 border-success-border bg-success-bg px-2 py-1 text-label text-success-ink">
            <Check aria-hidden="true" className="size-4" strokeWidth={3} />
            {card.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Classificar: um cartão por vez em cima; as caixas sempre no mesmo lugar embaixo. */
export function SortBoard({ item, placed, current, pieceProps }: BoardProps) {
  const place = item.place!;
  const card = current >= 0 ? place.cards![current] : undefined;
  return (
    <div className="flex w-full flex-col gap-12">
      {card ? <CurrentCard card={card} index={current} total={place.cards!.length} /> : null}
      <div role="group" aria-label="Caixas" className="grid w-full gap-6 sm:grid-cols-2">
        {place.tiles.map((group) => (
          <Box
            key={group.id}
            group={group}
            cards={place.cards!.filter((_, i) => placed[i] === group.id)}
            disabled={!card}
            props={pieceProps(group.id)}
          />
        ))}
      </div>
    </div>
  );
}
