"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActivityStimulus } from "@/components/activity-stimulus";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { Pictogram } from "@/components/pictogram";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import {
  answer,
  initialItemState,
  requestHint,
  type AttemptRecord,
} from "@/lib/activities/runner";
import { canSpeak, speak } from "@/lib/speech";
import type { AttemptInput } from "@/lib/validation/telemetry";
import type { PlayItem } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

type StartResult = { ok: true; sessionId: string } | { ok: false };

interface ActivityRunnerProps {
  activityId: string;
  title: string;
  items: PlayItem[];
  /** Server Actions (ou dublês nos testes). Falhas de telemetria nunca travam a criança. */
  onStart: (activityId: string) => Promise<StartResult>;
  onRecord: (sessionId: string, attempt: AttemptInput) => Promise<{ ok: boolean }>;
  onFinish: (sessionId: string) => Promise<{ ok: boolean }>;
  now?: () => number;
  backHref?: string;
}

function optionTextClass(stimulus: PlayItem["stimulus"]): string {
  if (stimulus.kind === "letter") return "font-letra text-letra-bastao";
  if (stimulus.kind === "count") return "text-numeral";
  return "text-button";
}

function toInput(a: AttemptRecord): AttemptInput {
  return {
    itemKey: a.itemKey,
    optionId: a.optionId,
    helpLevel: a.helpLevel,
    elapsedMs: a.elapsedMs,
    attemptNo: a.attemptNo,
  };
}

export function ActivityRunner({
  activityId,
  title,
  items,
  onStart,
  onRecord,
  onFinish,
  now = Date.now,
  backHref = "/aluno/atividades",
}: ActivityRunnerProps) {
  const [index, setIndex] = useState(0);
  const [state, setState] = useState(() => initialItemState(now()));
  const [done, setDone] = useState(false);
  const [canListen, setCanListen] = useState(false);

  const session = useRef<Promise<string | null> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
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

  /** A sessão só abre na 1ª resposta (evita sessões vazias e duplicadas pelo Strict Mode). */
  const ensureSession = (): Promise<string | null> => {
    session.current ??= onStart(activityId).then(
      (r) => (r.ok ? r.sessionId : null),
      () => null,
    );
    return session.current;
  };

  const send = (attempt: AttemptRecord) => {
    queue.current = queue.current.then(async () => {
      try {
        const sessionId = await ensureSession();
        if (sessionId) await onRecord(sessionId, toInput(attempt));
      } catch {
        // Telemetria é best-effort: a atividade continua.
      }
    });
  };

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
    await queue.current;
    try {
      const sessionId = await session.current;
      if (sessionId) await onFinish(sessionId);
    } catch {
      // idem: não bloqueia a conclusão
    }
  };

  if (done) {
    return (
      <section className="flex flex-col gap-12" aria-labelledby="fim">
        <h1 id="fim" tabIndex={-1} ref={(el) => el?.focus()} className="text-display">
          Muito bem!
        </h1>
        <Feedback tone="acerto" title="Você terminou!">
          {title}
        </Feedback>
        <Link href={backHref} className={cn(buttonVariants({ variant: "principal" }), "self-start")}>
          <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Voltar
        </Link>
      </section>
    );
  }

  const correctOption = item.options.find((o) => o.id === item.correctId);
  const isLast = index === items.length - 1;
  const hintText = state.visualHint ? "Olhe a opção marcada." : state.hintShown ? item.hint : null;

  let feedback: { tone: "acerto" | "redirecionar"; title: string; text: string } | null = null;
  if (state.status === "correct") {
    feedback = { tone: "acerto", title: "Isso!", text: `Você achou: ${correctOption?.label ?? ""}.` };
  } else if (state.status === "redirect") {
    feedback = { tone: "redirecionar", title: "Quase!", text: hintText ?? "Vamos tentar de novo." };
  } else if (hintText) {
    feedback = { tone: "redirecionar", title: "Dica", text: hintText };
  }

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
          {item.options.map((option) => {
            const isCorrectChosen = state.status === "correct" && option.id === item.correctId;
            const highlighted =
              state.visualHint && state.status !== "correct" && option.id === item.correctId;
            return (
              <button
                key={option.id}
                type="button"
                aria-disabled={state.status === "correct" && !isCorrectChosen ? true : undefined}
                onClick={() => choose(option.id)}
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
                <AdaptiveLabel
                  text={option.label}
                  icon={option.icon ? <Pictogram name={option.icon} /> : undefined}
                />
                {isCorrectChosen ? (
                  <Check aria-hidden="true" className="size-8" strokeWidth={3} />
                ) : null}
                {highlighted ? (
                  <>
                    <Eye aria-hidden="true" className="size-8" strokeWidth={2.5} />
                    <span className="sr-only">Dica: esta opção</span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      {/* A região live existe antes do texto mudar, para os leitores de tela anunciarem. */}
      <div role="status" aria-live="polite" className="min-h-[88px]">
        {feedback ? (
          <Feedback announce={false} tone={feedback.tone} title={feedback.title}>
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
