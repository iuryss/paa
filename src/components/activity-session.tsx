"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import type { AttemptRecord } from "@/lib/activities/runner";
import type { AttemptInput } from "@/lib/validation/telemetry";
import { cn } from "@/lib/utils";

export type StartResult = { ok: true; sessionId: string } | { ok: false };

/** Server Actions (ou dublês nos testes). Falhas de telemetria nunca travam a criança. */
export interface SessionCallbacks {
  onStart: (activityId: string) => Promise<StartResult>;
  onRecord: (sessionId: string, attempt: AttemptInput) => Promise<{ ok: boolean }>;
  onFinish: (sessionId: string) => Promise<{ ok: boolean }>;
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

/**
 * Telemetria de uma atividade, compartilhada por todos os tipos de tela.
 * A sessão só abre na 1ª resposta (evita sessões vazias e duplicadas pelo Strict Mode);
 * as tentativas vão em fila, na ordem, e a sessão só fecha depois da última.
 */
export function useActivitySession(activityId: string, { onStart, onRecord, onFinish }: SessionCallbacks) {
  const session = useRef<Promise<string | null> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

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

  const finish = async () => {
    await queue.current;
    try {
      const sessionId = await session.current;
      if (sessionId) await onFinish(sessionId);
    } catch {
      // idem: não bloqueia a conclusão
    }
  };

  return { send, finish };
}

/** Tela final, igual em todas as atividades. */
export function ActivityDone({ title, backHref }: { title: string; backHref: string }) {
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
