"use client";

import { DndContext, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent } from "@dnd-kit/core";
import { Lightbulb } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FiguresBoard, OrderBoard, SortBoard } from "@/components/place-boards";
import { CardContent, DROP_ID, DropArea, Piece, PieceBank, type PieceProps } from "@/components/place-pieces";
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
import type { PlacePlay, PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

const DONE_TEXT: Record<PlacePlay["mode"], string> = {
  lacunas: "Você completou tudo!",
  ligar: "Você ligou todos!",
  ordenar: "Você colocou tudo na ordem!",
  nomear: "Você nomeou todas!",
  classificar: "Você separou todos!",
};

const HOW_TO: Record<PlacePlay["mode"], string> = {
  lacunas: "Toque na palavra (ou aperte Enter) para colocar na próxima lacuna. Também dá para arrastar.",
  ligar: "Toque no par certo (ou aperte Enter) para ligar com o item destacado. Também dá para arrastar.",
  ordenar: "Toque na peça (ou aperte Enter) para colocar na próxima posição. Também dá para arrastar.",
  nomear: "Toque na palavra (ou aperte Enter) para colocar na figura destacada. Também dá para arrastar.",
  classificar: "Toque na caixa certa (ou aperte Enter) para guardar o cartão. Também dá para arrastar o cartão.",
};

const ANNOUNCEMENTS: Announcements = {
  onDragStart: () => "Você pegou uma peça.",
  onDragOver: ({ over }) => (over ? "A peça está em cima do lugar certo para soltar." : undefined),
  onDragEnd: ({ over }) => (over ? "Você soltou a peça." : "A peça voltou para o lugar."),
  onDragCancel: () => "A peça voltou para o lugar.",
};

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
    reusableTiles: place.mode === "classificar",
  };
  const [state, setState] = useState(() => initialPlaceState(board, now()));
  const pieceRefs = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const dragging = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isLigar = place.mode === "ligar";
  const isSort = place.mode === "classificar";

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
    else if (result.attempt.correct && !isSort) {
      // O foco vai para a próxima peça livre (no ligar, as já ligadas continuam na tela, mas travadas).
      refocus.current = place.tiles.find((t) => !result.state.placed.includes(t.id))?.id ?? null;
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    // Classificar: arrasta-se o cartão e o alvo é a caixa. Nos outros, arrasta-se a peça até a área.
    if (isSort && event.over) place_(String(event.over.id));
    else if (event.over?.id === DROP_ID) place_(String(event.active.id));
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
    feedback = { tone: "acerto", title: "Isso!", text: DONE_TEXT[place.mode] };
  } else if (state.status === "placed") {
    const lastCard = isSort ? place.cards![state.placed.length - 1] : undefined;
    const text = isLigar
      ? `${lastLeft?.label} com ${lastPlaced?.label}.`
      : isSort
        ? `${lastCard?.label} em ${lastPlaced?.label}.`
        : `“${lastPlaced?.label}”.`;
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
            {HOW_TO[place.mode]}
          </p>
          {isLigar ? (
            <PairsBoard
              item={item}
              placed={state.placed}
              current={done ? -1 : state.slot}
              pieceProps={pieceProps}
            />
          ) : place.mode === "lacunas" ? (
            <GapsBoard item={item} placed={state.placed} current={done ? -1 : state.slot} pieceProps={pieceProps} />
          ) : place.mode === "ordenar" ? (
            <OrderBoard item={item} placed={state.placed} current={done ? -1 : state.slot} pieceProps={pieceProps} />
          ) : place.mode === "nomear" ? (
            <FiguresBoard item={item} placed={state.placed} current={done ? -1 : state.slot} pieceProps={pieceProps} />
          ) : (
            <SortBoard item={item} placed={state.placed} current={done ? -1 : state.slot} pieceProps={pieceProps} />
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

      <PieceBank item={item} label="Palavras" placed={placed} pieceProps={pieceProps} />
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
