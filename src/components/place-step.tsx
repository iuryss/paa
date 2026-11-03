"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye, Lightbulb } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { Pictogram } from "@/components/pictogram";
import { UploadedImage } from "@/components/uploaded-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import {
  hintedTile,
  initialPlaceState,
  placeOnBoard,
  requestPlaceHint,
  type PlaceBoard,
} from "@/lib/activities/place";
import type { AttemptRecord } from "@/lib/activities/runner";
import type { PlaceCard, PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

const DROP_ID = "alvo";

const ANNOUNCEMENTS: Announcements = {
  onDragStart: () => "Você pegou uma peça.",
  onDragOver: ({ over }) => (over ? "A peça está em cima do lugar certo para soltar." : undefined),
  onDragEnd: ({ over }) => (over ? "Você soltou a peça." : "A peça voltou para o lugar."),
  onDragCancel: () => "A peça voltou para o lugar.",
};

function CardContent({ card, imageClass = "max-h-16" }: { card: PlaceCard; imageClass?: string }) {
  return (
    <>
      {card.image ? <UploadedImage image={card.image} className={cn(imageClass, "basis-full")} /> : null}
      <AdaptiveLabel text={card.label} icon={card.icon ? <Pictogram name={card.icon} /> : undefined} />
    </>
  );
}

/** Peça tocável, arrastável e acionável por teclado (Enter = colocar na próxima casa). */
function Piece({
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
      aria-label={`${name}${highlighted ? ". Dica: esta" : ""}`}
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

function DropArea({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
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

interface PlaceStepProps {
  item: PlayItem;
  stimulus: ReactNode;
  now: () => number;
  send: (attempt: AttemptRecord) => void;
  onDone: () => void;
}

/**
 * Passo de ENCAIXAR da folha: completar lacunas (palavra → lacuna) ou ligar pares (par → item).
 * Usa o mesmo motor do "escrever o nome": uma casa por vez, tocar / teclado / arrastar, dica que
 * conta (a dica do professor) e depois destaca a peça certa.
 */
export function PlaceStep({ item, stimulus, now, send, onDone }: PlaceStepProps) {
  const place = item.place!;
  const uid = useId();
  const board: PlaceBoard = {
    slots: place.slots,
    tiles: place.tiles.map((t) => ({ id: t.id, value: t.value })),
    canTell: Boolean(item.hint),
  };
  const [state, setState] = useState(() => initialPlaceState(board, now()));
  const pieceRefs = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const dragging = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isLigar = place.mode === "ligar";

  const tileOf = (id: string) => place.tiles.find((t) => t.id === id);
  const highlightedId = state.highlight ? hintedTile(board, state)?.id : undefined;
  const highlightedLabel = highlightedId ? tileOf(highlightedId)?.label : undefined;
  const done = state.status === "done";

  useEffect(() => {
    if (!refocus.current) return;
    pieceRefs.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [state.placed.length]);

  const place_ = (tileId: string) => {
    const result = placeOnBoard(board, state, tileId, now());
    if (!result.attempt) return;
    setState(result.state);
    send(result.attempt);
    if (result.state.status === "done") onDone();
    else if (result.attempt.correct) {
      // O foco vai para a próxima peça livre (no ligar, as já ligadas continuam na tela, mas travadas).
      refocus.current = place.tiles.find((t) => !result.state.placed.includes(t.id))?.id ?? null;
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.over?.id === DROP_ID) place_(String(event.active.id));
    setTimeout(() => (dragging.current = false), 0);
  };

  // ── Feedback ──
  const lastPlaced = state.placed.length > 0 ? tileOf(state.placed.at(-1)!) : undefined;
  const lastLeft = isLigar && state.placed.length > 0 ? place.left![state.placed.length - 1] : undefined;
  const hintText = state.highlight
    ? `Toque em “${highlightedLabel ?? ""}”, que está em destaque.`
    : state.told
      ? (item.hint ?? null)
      : null;
  let feedback: { tone: "acerto" | "redirecionar"; title: string; text: string } | null = null;
  if (done) {
    feedback = { tone: "acerto", title: "Isso!", text: isLigar ? "Você ligou todos!" : "Você completou tudo!" };
  } else if (state.status === "placed") {
    const text = isLigar ? `${lastLeft?.label} com ${lastPlaced?.label}.` : `“${lastPlaced?.label}”.`;
    feedback = { tone: "acerto", title: "Isso!", text };
  } else if (state.status === "redirect") {
    feedback = { tone: "redirecionar", title: "Quase!", text: hintText ?? "Vamos tentar outra." };
  } else if (hintText) {
    feedback = { tone: "redirecionar", title: "Dica", text: hintText };
  }

  const pieceProps = (tileId: string) => ({
    describedBy: `${uid}-como`,
    highlighted: highlightedId === tileId,
    onPlace: () => {
      if (!dragging.current) place_(tileId);
    },
    buttonRef: (el: HTMLButtonElement | null) => {
      if (el) pieceRefs.current.set(tileId, el);
      else pieceRefs.current.delete(tileId);
    },
  });

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{
          announcements: ANNOUNCEMENTS,
          screenReaderInstructions: { draggable: "Toque na peça (ou aperte Enter) para colocar no próximo lugar." },
        }}
        onDragStart={() => (dragging.current = true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setTimeout(() => (dragging.current = false), 0)}
      >
        <Card className="flex flex-col items-center gap-12">
          {stimulus}
          <p id={`${uid}-como`} className="sr-only">
            {isLigar
              ? "Toque no par certo (ou aperte Enter) para ligar com o item destacado. Também dá para arrastar."
              : "Toque na palavra (ou aperte Enter) para colocar na próxima lacuna. Também dá para arrastar."}
          </p>
          {isLigar ? (
            <PairsBoard
              item={item}
              placed={state.placed}
              current={done ? -1 : state.slot}
              pieceProps={pieceProps}
            />
          ) : (
            <GapsBoard item={item} placed={state.placed} current={done ? -1 : state.slot} pieceProps={pieceProps} />
          )}
        </Card>
      </DndContext>

      {/* A região live existe antes do texto mudar, para os leitores de tela anunciarem. */}
      <div role="status" aria-live="polite" className="min-h-[88px]">
        {feedback ? (
          <Feedback announce={false} tone={feedback.tone} title={feedback.title}>
            {feedback.text}
          </Feedback>
        ) : null}
      </div>

      {!done ? (
        <div className="flex min-h-[88px] items-center">
          <Button icon={Lightbulb} onClick={() => setState(requestPlaceHint(board, state))}>
            Dica
          </Button>
        </div>
      ) : null}
    </>
  );
}

type PieceProps = (tileId: string) => {
  describedBy: string;
  highlighted: boolean;
  onPlace: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
};

/** A frase com as lacunas dentro do texto + o banco de palavras. */
function GapsBoard({
  item,
  placed,
  current,
  pieceProps,
}: {
  item: PlayItem;
  placed: string[];
  current: number;
  pieceProps: PieceProps;
}) {
  const place = item.place!;
  const label = (id: string | undefined) => place.tiles.find((t) => t.id === id)?.label;
  let gap = -1;
  return (
    <div className="flex w-full flex-col gap-12">
      <DropArea label="Frase para completar">
        <p className="max-w-[45ch] text-leitura leading-[3.25rem] text-ink">
          {place.segments!.map((segment, i) => {
            if (segment !== null) return <span key={i}>{segment}</span>;
            gap += 1;
            const word = label(placed[gap]);
            const isCurrent = gap === current;
            return (
              <span
                key={i}
                data-gap={gap + 1}
                data-state={word ? "preenchida" : isCurrent ? "atual" : "vazia"}
                className={cn(
                  "mx-1 inline-flex min-h-12 min-w-[6ch] items-center justify-center rounded-[12px] border-2 px-2 align-middle",
                  word
                    ? "border-success-border bg-success-bg text-success-ink"
                    : isCurrent
                      ? "border-dashed border-drop-active-border bg-drop-active-bg"
                      : "border-dashed border-drop-border bg-drop-bg",
                )}
              >
                <span aria-hidden="true">{word ?? ""}</span>
                <span className="sr-only">{`Lacuna ${gap + 1}: ${word ? word : isCurrent ? "a próxima" : "vazia"}`}</span>
              </span>
            );
          })}
        </p>
      </DropArea>

      <div role="group" aria-label="Palavras" className="flex flex-wrap justify-center gap-6">
        {place.tiles.map((tile) =>
          placed.includes(tile.id) ? (
            // A palavra usada deixa o lugar marcado: as outras não mudam de posição.
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
    </div>
  );
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Duas colunas; o item da vez (esquerda) fica destacado e cada par certo ganha uma linha. */
function PairsBoard({
  item,
  placed,
  current,
  pieceProps,
}: {
  item: PlayItem;
  placed: string[];
  current: number;
  pieceProps: PieceProps;
}) {
  const place = item.place!;
  const container = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [lines, setLines] = useState<Line[]>([]);

  const measure = useCallback(() => {
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    setLines(
      placed.flatMap((tileId, i) => {
        const a = leftRefs.current[i]?.getBoundingClientRect();
        const b = container.current?.querySelector(`[data-piece="${tileId}"]`)?.getBoundingClientRect();
        if (!a || !b) return [];
        return [{ x1: a.right - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left, y2: b.top + b.height / 2 - box.top }];
      }),
    );
  }, [placed]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const pairedWith = (i: number) => place.tiles.find((t) => t.id === placed[i])?.label;

  return (
    <div ref={container} className="relative grid w-full grid-cols-2 gap-x-12">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="stroke-success-border" strokeWidth={4} strokeLinecap="round" />
        ))}
      </svg>

      <DropArea label="Itens para ligar" className="p-0">
        <ol className="flex flex-col gap-6">
          {place.left!.map((card, i) => {
            const partner = pairedWith(i);
            const isCurrent = i === current;
            return (
              <li
                key={i}
                ref={(el) => {
                  leftRefs.current[i] = el;
                }}
                data-left={i + 1}
                data-state={partner ? "ligado" : isCurrent ? "atual" : "esperando"}
                className={cn(
                  "flex min-h-target flex-wrap items-center justify-center gap-2 rounded-[20px] border-2 px-4 py-2 text-button",
                  partner
                    ? "border-success-border bg-success-bg text-success-ink"
                    : isCurrent
                      ? "border-dashed border-drop-active-border bg-drop-active-bg text-ink"
                      : "border-border-subtle bg-surface text-ink",
                )}
              >
                <CardContent card={card} />
                <span className="sr-only">{partner ? `: ligado com ${partner}` : isCurrent ? ": o próximo para ligar" : ""}</span>
              </li>
            );
          })}
        </ol>
      </DropArea>

      <div role="group" aria-label="Para ligar" className="flex flex-col gap-6 py-0">
        {place.tiles.map((tile) => {
          const used = placed.includes(tile.id);
          return (
            <Piece key={tile.id} id={tile.id} name={tile.label} disabled={used} done={used} {...pieceProps(tile.id)}>
              <CardContent card={tile} />
            </Piece>
          );
        })}
      </div>
    </div>
  );
}
