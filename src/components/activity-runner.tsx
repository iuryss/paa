"use client";

import { ArrowRight, Check, Eye, Lightbulb, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import { ActivityDone, useActivitySession, type SessionCallbacks } from "@/components/activity-session";
import { ActivityStimulus } from "@/components/activity-stimulus";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { MarkerShape } from "@/components/marker-shape";
import { MathText } from "@/components/math-text";
import { NumberPad } from "@/components/number-pad";
import { Pictogram } from "@/components/pictogram";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { PlaceStep } from "@/components/place-step";
import { SheetSupportBlock } from "@/components/sheet-support";
import { UploadedImage } from "@/components/uploaded-image";
import { WordMarks } from "@/components/word-marks";
import {
  answer,
  hintedOptionIndex,
  initialItemState,
  remainingCorrect,
  requestHint,
} from "@/lib/activities/runner";
import {
  DEFAULT_MARKER_STYLE,
  lookForText,
  markerFor,
  resolveMarkerStyle,
  tapHighlightedText,
  type MarkerStyle,
} from "@/lib/activities/markers";
import { encodeTyped, spokenMath } from "@/lib/activities/math";
import { canSpeak, speak } from "@/lib/speech";
import { isCorrectOption, type PlayItem, type SheetSupport } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

interface ActivityRunnerProps extends SessionCallbacks {
  activityId: string;
  title: string;
  items: PlayItem[];
  /** Escolha do professor. No tema Foco Alto vira só formas. */
  markerStyle?: MarkerStyle;
  /** Folha: bloco de apoio mostrado acima de todos os exercícios. */
  sheet?: SheetSupport;
  now?: () => number;
  backHref?: string;
}

/** "Exercício 2 de 3 · Frase 1 de 4" (folha) ou "Passo 2 de 5". */
function progressLabel(item: PlayItem, index: number, total: number): string {
  if (!item.exercise) return `Passo ${index + 1} de ${total}`;
  const { part } = item.exercise;
  return `Exercício ${item.exercise.index} de ${item.exercise.total}${part ? ` · ${part.label ?? "Frase"} ${part.index} de ${part.total}` : ""}`;
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
  sheet,
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

  /** Conta digitada: confere como qualquer resposta. Devolve se acertou (a errada é limpa no teclado). */
  const submitTyped = (value: string): boolean => {
    const optionId = encodeTyped(value);
    if (!optionId) return false;
    choose(optionId);
    return isCorrectOption(item, optionId);
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
  // A dica aponta a certa ainda não encontrada (no "marcar todas" ela muda a cada acerto).
  const targetIndex = hintedOptionIndex(item, state);
  const correctMarker = item.noMarkers ? undefined : markers[targetIndex];
  const lastFound = item.options.find((o) => o.id === state.found.at(-1));
  const multi = Boolean(item.correctIds);
  const remaining = remainingCorrect(item, state);
  const isLast = index === items.length - 1;

  // Degrau mais alto da escada de dicas que a criança já alcançou.
  const pointed = state.visualHint || state.markerHint ? correctMarker : undefined;
  // Sem marcadores, o degrau do destaque é a palavra marcada na tela, ou a resposta da conta.
  const unmarkedHint = item.typed
    ? `A resposta é ${item.typed.answer}.`
    : `Toque em “${item.options[targetIndex]?.label ?? ""}”, que está em destaque.`;
  const hintText = pointed
    ? state.visualHint
      ? tapHighlightedText(pointed)
      : lookForText(pointed)
    : item.noMarkers && state.visualHint
      ? unmarkedHint
      : state.hintShown
        ? item.hint
        : null;

  let feedback: { tone: "acerto" | "redirecionar"; title: string; text: string } | null = null;
  if (state.status === "correct") {
    const text = item.typed
      ? `A resposta é ${item.typed.answer}.`
      : multi
        ? "Você achou todas!"
        : `Você achou: ${lastFound?.label ?? ""}.`;
    feedback = { tone: "acerto", title: "Isso!", text };
  } else if (state.status === "partial") {
    const text = `Você achou: ${lastFound?.label ?? ""}. Falta${remaining > 1 ? "m" : ""} ${remaining}.`;
    feedback = { tone: "acerto", title: "Isso!", text };
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
            <MathText text={item.prompt} />
          </h1>
          <p className="text-subtitle text-ink-muted">{progressLabel(item, index, items.length)}</p>
          {multi ? (
            <p className="text-label text-ink">
              {item.words ? "Toque nas palavras certas" : "Marque todas as certas"}: {state.found.length} de {item.correctIds!.length}.
            </p>
          ) : null}
        </div>
        <Button
          variant="icone"
          icon={Volume2}
          aria-label="Ouvir de novo"
          disabled={!canListen}
          onClick={() =>
            speak([item.prompt, item.stimulus.kind === "free" ? item.stimulus.text : ""].filter(Boolean).join(". "))
          }
        />
      </header>

      {sheet ? <SheetSupportBlock sheet={sheet} /> : null}

      {item.place ? (
        // Encaixar (lacunas, ligar pares): o passo cuida das peças, do feedback e da dica.
        <PlaceStep
          key={item.key}
          item={item}
          stimulus={<ActivityStimulus stimulus={item.stimulus} />}
          now={now}
          send={send}
          onDone={() => setState((s) => ({ ...s, status: "correct" }))}
        />
      ) : (
      <>
      <Card className="flex flex-col items-center gap-12">
        <ActivityStimulus stimulus={item.stimulus} />
        {item.typed ? (
          <NumberPad key={item.key} expression={item.typed.expression} done={state.status === "correct"} onSubmit={submitTyped} />
        ) : item.words ? (
          <WordMarks
            words={item.options}
            found={state.found}
            highlightedId={state.visualHint && state.status !== "correct" ? item.options[targetIndex]?.id : undefined}
            done={state.status === "correct"}
            onToggle={choose}
          />
        ) : (
        <div role="group" aria-label="Respostas" className="grid w-full grid-cols-2 gap-6">
          {item.options.map((option, i) => {
            const marker = markers[i]!;
            const isCorrectChosen = state.found.includes(option.id);
            const highlighted = state.visualHint && state.status !== "correct" && i === targetIndex;
            return (
              <button
                key={option.id}
                type="button"
                // Nome explícito (começa pelo texto visível, WCAG 2.5.3): "a, triângulo amarelo".
                aria-label={`${spokenMath(option.label)}, ${marker.name}${highlighted ? ". Dica: esta opção" : ""}`}
                // Já encontrada (marcar todas) ou passo concluído: tocar de novo não faz nada.
                aria-disabled={isCorrectChosen || state.status === "correct" ? true : undefined}
                aria-pressed={multi ? isCorrectChosen : undefined}
                onClick={() => choose(option.id)}
                data-marker={marker.shape}
                className={cn(
                  "flex min-h-target-lg items-center justify-center gap-3 rounded-[20px] border-2 px-4 py-3",
                  option.image && "flex-wrap",
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
                {option.image ? <UploadedImage image={option.image} className="max-h-24 basis-full" /> : null}
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
        )}
      </Card>

      {/* A região live existe antes do texto mudar, para os leitores de tela anunciarem. */}
      <div role="status" aria-live="polite" className="min-h-[88px]">
        {feedback ? (
          <Feedback announce={false} tone={feedback.tone} title={feedback.title} icon={feedbackIcon}>
            {feedback.text}
          </Feedback>
        ) : null}
      </div>
      </>
      )}

      <div className="flex min-h-[88px] flex-wrap items-center justify-between gap-6">
        {state.status === "correct" || item.place ? (
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
