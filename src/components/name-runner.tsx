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
import { ArrowRight, Eye, Lightbulb, Volume2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ActivityDone, useActivitySession, type SessionCallbacks } from "@/components/activity-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { letterSlots, type NamePlayItem, type NameTile } from "@/lib/activities/name";
import {
  expectedLetter,
  hintTile,
  initialSequenceState,
  placeTile,
  requestSequenceHint,
} from "@/lib/activities/sequence";
import { canSpeak, speak } from "@/lib/speech";
import { cn } from "@/lib/utils";

interface NameRunnerProps extends SessionCallbacks {
  activityId: string;
  title: string;
  item: NamePlayItem;
  now?: () => number;
  backHref?: string;
}

const NAME_DROP = "nome";

// Textos do @dnd-kit para leitores de tela, em português (o padrão é inglês).
const ANNOUNCEMENTS: Announcements = {
  onDragStart: () => "Você pegou uma letra.",
  onDragOver: ({ over }) => (over ? "A letra está em cima do seu nome. Solte para colocar." : undefined),
  onDragEnd: ({ over }) => (over ? "Você soltou a letra no seu nome." : "A letra voltou para o quadro."),
  onDragCancel: () => "A letra voltou para o quadro.",
};

function Tile({
  tile,
  highlighted,
  describedBy,
  onPlace,
  buttonRef,
}: {
  tile: NameTile;
  highlighted: boolean;
  describedBy: string;
  onPlace: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id: tile.id });
  return (
    <button
      ref={(el) => {
        setNodeRef(el);
        buttonRef(el);
      }}
      type="button"
      data-tile={tile.letter}
      aria-label={`Letra ${tile.letter}${highlighted ? ". Dica: esta letra" : ""}`}
      aria-describedby={describedBy}
      onClick={onPlace}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "relative flex size-[88px] items-center justify-center rounded-[20px] border-2",
        "select-none touch-none font-letra text-letra-bastao text-ink",
        highlighted ? "border-drop-active-border bg-drop-active-bg" : "border-border bg-surface",
        isDragging ? "z-10 shadow-lift" : "shadow-rest",
      )}
    >
      <span aria-hidden="true">{tile.letter}</span>
      {highlighted ? (
        <Eye aria-hidden="true" className="absolute right-1 top-1 size-6" strokeWidth={2.5} />
      ) : null}
    </button>
  );
}

function NameSlots({
  item,
  placedLetters,
  current,
  done,
}: {
  item: NamePlayItem;
  placedLetters: string[];
  current: number;
  done: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: NAME_DROP });
  let slot = -1;
  return (
    <ol
      ref={setNodeRef}
      aria-label="Seu nome"
      className={cn(
        "flex flex-wrap items-end justify-center gap-3 rounded-[20px] border-2 border-dashed p-4",
        isOver ? "border-drop-active-border bg-drop-active-bg" : "border-transparent",
      )}
    >
      {item.cells.map((cell, i) => {
        if (cell.kind === "gap") {
          return (
            <li key={i} aria-hidden="true" className="flex h-16 w-6 items-center justify-center text-title text-ink-muted">
              {cell.char === "-" ? "-" : ""}
            </li>
          );
        }
        slot += 1;
        const letter = placedLetters[slot];
        const isCurrent = !done && slot === current;
        return (
          <li
            key={i}
            data-slot={slot + 1}
            data-state={letter ? "preenchida" : isCurrent ? "atual" : "vazia"}
            className={cn(
              "flex size-16 items-center justify-center rounded-[12px] border-2 font-letra text-title",
              letter
                ? "border-success-border bg-success-bg text-success-ink"
                : isCurrent
                  ? "border-dashed border-drop-active-border bg-drop-active-bg"
                  : "border-dashed border-drop-border bg-drop-bg",
            )}
          >
            <span aria-hidden="true">{letter ?? ""}</span>
            <span className="sr-only">
              {`Casa ${slot + 1}: ${letter ? `letra ${letter}` : isCurrent ? "a próxima" : "vazia"}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function NameRunner({
  activityId,
  title,
  item,
  onStart,
  onRecord,
  onFinish,
  now = Date.now,
  backHref = "/aluno/atividades",
}: NameRunnerProps) {
  const uid = useId();
  const [state, setState] = useState(() => initialSequenceState(item, now()));
  const [finished, setFinished] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const { send, finish } = useActivitySession(activityId, { onStart, onRecord, onFinish });
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const next = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const refocus = useRef<string | null>(null);

  // Distância mínima: um toque rápido continua sendo "toque" (coloca a letra), não arrasto.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => setCanListen(canSpeak()), []);

  useEffect(() => {
    if (state.status === "done") next.current?.focus();
  }, [state.status]);

  // Logo depois de a tela atualizar (e não um quadro depois): assim não briga com um Tab rápido.
  useEffect(() => {
    if (!refocus.current) return;
    tileRefs.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [state.placed.length]);

  if (finished) return <ActivityDone title={title} backHref={backHref} />;

  const slots = letterSlots(item.cells);
  const tilesById = new Map(item.tiles.map((t) => [t.id, t]));
  const placedLetters = state.placed.map((id) => tilesById.get(id)?.letter ?? "");
  const nextLetter = expectedLetter(item, state);
  const highlightedTile = state.highlight ? hintTile(item, state) : undefined;
  const nameText = item.cells.map((c) => (c.kind === "letter" ? c.letter : c.char)).join("");

  const place = (tileId: string) => {
    const result = placeTile(item, state, tileId, now());
    if (!result.attempt) return;
    setState(result.state);
    send(result.attempt);
    // A peça saiu do quadro: o foco vai para a próxima letra livre (nunca se perde no vazio).
    if (result.attempt.correct && result.state.status !== "done") {
      refocus.current = item.tiles.find((t) => !result.state.placed.includes(t.id))?.id ?? null;
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.over?.id === NAME_DROP) place(String(event.active.id));
    // O clique que o navegador dispara ao soltar não pode virar um segundo "toque".
    setTimeout(() => (dragging.current = false), 0);
  };

  const hintText = state.highlight
    ? `Toque na letra ${nextLetter}, que está em destaque.`
    : state.letterHint
      ? `A próxima letra é ${nextLetter}.`
      : null;

  let feedback: { tone: "acerto" | "redirecionar"; title: string; text: string } | null = null;
  if (state.status === "done") {
    feedback = { tone: "acerto", title: "Isso!", text: `Você escreveu seu nome: ${nameText}!` };
  } else if (state.status === "placed") {
    feedback = { tone: "acerto", title: "Isso!", text: `A letra ${placedLetters.at(-1)}.` };
  } else if (state.status === "redirect") {
    feedback = { tone: "redirecionar", title: "Quase!", text: hintText ?? "Vamos tentar outra letra." };
  } else if (hintText) {
    feedback = { tone: "redirecionar", title: "Dica", text: hintText };
  }

  return (
    <section className="flex flex-col gap-12" aria-labelledby="pergunta">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 id="pergunta">{item.prompt}</h1>
          <p className="text-subtitle text-ink-muted">
            {state.status === "done" ? "Pronto!" : `Letra ${state.slot + 1} de ${slots.length}`}
          </p>
        </div>
        <Button
          variant="icone"
          icon={Volume2}
          aria-label="Ouvir de novo"
          disabled={!canListen}
          onClick={() => speak(item.prompt)}
        />
      </header>

      <DndContext
        sensors={sensors}
        accessibility={{
          announcements: ANNOUNCEMENTS,
          screenReaderInstructions: { draggable: "Toque na letra (ou aperte Enter) para colocar no próximo espaço." },
        }}
        onDragStart={() => (dragging.current = true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setTimeout(() => (dragging.current = false), 0)}
      >
        <Card className="flex flex-col items-center gap-12">
          {state.modelVisible ? (
            <p className="flex flex-wrap items-baseline justify-center gap-3">
              <span className="text-label text-ink-muted">Seu nome:</span>
              <span className="font-letra text-title text-ink">{nameText}</span>
            </p>
          ) : null}

          <NameSlots item={item} placedLetters={placedLetters} current={state.slot} done={state.status === "done"} />

          <p id={`${uid}-como`} className="sr-only">
            Toque na letra ou aperte Enter para colocar no próximo espaço do seu nome. Também dá para arrastar.
          </p>
          <div role="group" aria-label="Letras" className="flex flex-wrap justify-center gap-6">
            {item.tiles.map((tile) =>
              state.placed.includes(tile.id) ? (
                // O lugar da peça usada fica marcado: as outras letras não mudam de posição.
                <span
                  key={tile.id}
                  aria-hidden="true"
                  className="size-[88px] rounded-[20px] border-2 border-dashed border-border-subtle"
                />
              ) : (
                <Tile
                  key={tile.id}
                  tile={tile}
                  highlighted={highlightedTile?.id === tile.id}
                  describedBy={`${uid}-como`}
                  buttonRef={(el) => {
                    if (el) tileRefs.current.set(tile.id, el);
                    else tileRefs.current.delete(tile.id);
                  }}
                  onPlace={() => {
                    if (!dragging.current) place(tile.id);
                  }}
                />
              ),
            )}
          </div>
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

      <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-6">
        {state.status === "done" ? (
          <span />
        ) : (
          <Button icon={Lightbulb} onClick={() => setState(requestSequenceHint(state))}>
            Dica
          </Button>
        )}
        {state.status === "done" ? (
          <Button
            ref={next}
            variant="principal"
            icon={ArrowRight}
            onClick={async () => {
              setFinished(true);
              await finish();
            }}
          >
            Terminar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
