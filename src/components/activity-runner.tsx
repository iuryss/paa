"use client";

import { ArrowRight, Check, Eye, Lightbulb, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import { ActivityDone, useActivitySession, type SessionCallbacks } from "@/components/activity-session";
import { ActivityStimulus } from "@/components/activity-stimulus";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { MarkerShape } from "@/components/marker-shape";
import { Pictogram } from "@/components/pictogram";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { answer, initialItemState, requestHint } from "@/lib/activities/runner";
import {
  DEFAULT_MARKER_STYLE,
  lookForText,
  markerFor,
  resolveMarkerStyle,
  tapHighlightedText,
  type MarkerStyle,
} from "@/lib/activities/markers";
import { canSpeak, speak } from "@/lib/speech";
import type { PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

interface ActivityRunnerProps extends SessionCallbacks {
  activityId: string;
  title: string;
  items: PlayItem[];
  /** Escolha do professor. No tema Foco Alto vira só formas. */
  markerStyle?: MarkerStyle;
  now?: () => number;
  backHref?: string;
}

function optionTextClass(stimulus: PlayItem["stimulus"]): string {
  if (stimulus.kind === "letter") return "font-letra text-letra-bastao";
  if (stimulus.kind === "count") return "text-numeral";
  return "text-button";
}

export function ActivityRunner({
  activityId,
  title,
  items,
  markerStyle = DEFAULT_MARKER_STYLE,
  onStart,
  onRecord,
  onFinish,
  now = Date.now,
  backHref = "/aluno/atividades",
}: ActivityRunnerProps) {
  const { prefs } = useAccessibility();
  const style = resolveMarkerStyle(markerStyle, prefs.theme);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState(() => initialItemState(now()));
  const [done, setDone] = useState(false);
  const [canListen, setCanListen] = useState(false);

  const { send, finish } = useActivitySession(activityId, { onStart, onRecord, onFinish });
  const heading = useRef<HTMLHeadingElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);

  const item = items[index];

  useEffect(() => setCanListen(canSpeak()), []);

  // Foco previsível: ao trocar de passo vai para a pergunta; ao acertar vai para "Continuar".
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [index]);

  useEffect(() => {
    if (state.status === "correct") next.current?.focus();
  }, [state.status]);

  if (!item) return null;

  const choose = (optionId: string) => {
    const result = answer(item, optionId, state, now());
    if (!result.attempt) return;
    setState(result.state);
    send(result.attempt);
  };

  const advance = async () => {
    if (index < items.length - 1) {
      setIndex(index + 1);
      setState(initialItemState(now()));
      return;
    }
    setDone(true);
    await finish();
  };

  if (done) return <ActivityDone title={title} backHref={backHref} />;

  // O marcador é da POSIÇÃO (as opções já chegam embaralhadas do servidor).
  const markers = item.options.map((_, i) => markerFor(i, style));
  const correctIndex = item.options.findIndex((o) => o.id === item.correctId);
  const correctOption = item.options[correctIndex];
  const correctMarker = markers[correctIndex];
  const isLast = index === items.length - 1;

  // Degrau mais alto da escada de dicas que a criança já alcançou.
  const pointed = state.visualHint || state.markerHint ? correctMarker : undefined;
  const hintText = pointed
    ? state.visualHint
      ? tapHighlightedText(pointed)
      : lookForText(pointed)
    : state.hintShown
      ? item.hint
      : null;

  let feedback: { tone: "acerto" | "redirecionar"; title: string; text: string } | null = null;
  if (state.status === "correct") {
    feedback = { tone: "acerto", title: "Isso!", text: `Você achou: ${correctOption?.label ?? ""}.` };
  } else if (state.status === "redirect") {
    feedback = { tone: "redirecionar", title: "Quase!", text: hintText ?? "Vamos tentar de novo." };
  } else if (hintText) {
    feedback = { tone: "redirecionar", title: "Dica", text: hintText };
  }
  const feedbackIcon =
    feedback?.tone === "redirecionar" && pointed ? (
      <MarkerShape marker={pointed} className="size-12" />
    ) : undefined;

  return (
    <section className="flex flex-col gap-12" aria-labelledby="pergunta">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 id="pergunta" tabIndex={-1} ref={heading}>
            {item.prompt}
          </h1>
          <p className="text-subtitle text-ink-muted">
            Passo {index + 1} de {items.length}
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

      <Card className="flex flex-col items-center gap-12">
        <ActivityStimulus stimulus={item.stimulus} />
        <div role="group" aria-label="Respostas" className="grid w-full grid-cols-2 gap-6">
          {item.options.map((option, i) => {
            const marker = markers[i]!;
            const isCorrectChosen = state.status === "correct" && option.id === item.correctId;
            const highlighted =
              state.visualHint && state.status !== "correct" && option.id === item.correctId;
            return (
              <button
                key={option.id}
                type="button"
                // Nome explícito (começa pelo texto visível, WCAG 2.5.3): "a, triângulo amarelo".
                aria-label={`${option.label}, ${marker.name}${highlighted ? ". Dica: esta opção" : ""}`}
                aria-disabled={state.status === "correct" && !isCorrectChosen ? true : undefined}
                onClick={() => choose(option.id)}
                data-marker={marker.shape}
                className={cn(
                  "flex min-h-target-lg items-center justify-center gap-3 rounded-[20px] border-2 px-4 py-3",
                  "select-none touch-manipulation text-ink",
                  optionTextClass(item.stimulus),
                  isCorrectChosen
                    ? "border-success-border bg-success-bg text-success-ink"
                    : highlighted
                      ? "border-drop-active-border bg-drop-active-bg"
                      : "border-border bg-surface",
                  state.status === "correct" && !isCorrectChosen && "opacity-70",
                )}
              >
                <MarkerShape marker={marker} />
                <AdaptiveLabel
                  text={option.label}
                  icon={option.icon ? <Pictogram name={option.icon} /> : undefined}
                />
                {isCorrectChosen ? (
                  <Check aria-hidden="true" className="size-8" strokeWidth={3} />
                ) : null}
                {highlighted ? <Eye aria-hidden="true" className="size-8" strokeWidth={2.5} /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      {/* A região live existe antes do texto mudar, para os leitores de tela anunciarem. */}
      <div role="status" aria-live="polite" className="min-h-[88px]">
        {feedback ? (
          <Feedback announce={false} tone={feedback.tone} title={feedback.title} icon={feedbackIcon}>
            {feedback.text}
          </Feedback>
        ) : null}
      </div>

      <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-6">
        {state.status === "correct" ? (
          <span />
        ) : (
          <Button icon={Lightbulb} onClick={() => setState(requestHint(item, state))}>
            Dica
          </Button>
        )}
        {state.status === "correct" ? (
          <Button ref={next} variant="principal" icon={ArrowRight} onClick={advance}>
            {isLast ? "Terminar" : "Continuar"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
