import { prisma } from "@/lib/db";
import { checkNameAttempt } from "@/lib/activities/name";
import { maxHelp } from "@/lib/activities/runner";
import { isCorrectOption, parseActivityContent } from "@/lib/validation/activities";
import type { AttemptInput } from "@/lib/validation/telemetry";

export type TelemetryErrorCode = "not_found" | "closed" | "invalid_item";

export class TelemetryError extends Error {
  constructor(public readonly code: TelemetryErrorCode) {
    super(code);
    this.name = "TelemetryError";
  }
}

/** Teto de duração registrada: protege os gráficos de abas esquecidas abertas. */
export const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

/** Sem nenhuma resposta por tanto tempo, a sessão é considerada interrompida. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Abre uma sessão. Só quem tem a atividade atribuída (e publicada) pode jogá-la. */
export async function startSession(
  studentId: string,
  activityId: string,
): Promise<{ sessionId: string }> {
  const assignment = await prisma.assignment.findFirst({
    where: { studentId, activityId, activity: { published: true } },
    select: { id: true },
  });
  if (!assignment) throw new TelemetryError("not_found");

  const profile = await prisma.sensoryProfile.findUnique({
    where: { userId: studentId },
    select: { theme: true, contentMode: true },
  });

  const session = await prisma.activitySession.create({
    data: {
      studentId,
      activityId,
      themeUsed: profile?.theme,
      contentModeUsed: profile?.contentMode,
    },
    select: { id: true },
  });
  return { sessionId: session.id };
}

/** Registra uma tentativa e atualiza os contadores da sessão de forma atômica. */
export async function recordAttempt(
  studentId: string,
  sessionId: string,
  input: AttemptInput,
): Promise<{ correct: boolean }> {
  const session = await prisma.activitySession.findFirst({
    where: { id: sessionId, studentId },
    select: {
      status: true,
      maxHelpLevel: true,
      activity: { select: { module: true, content: true } },
    },
  });
  if (!session) throw new TelemetryError("not_found");
  // Só sessão concluída é definitiva. Se a criança voltou a uma sessão "interrompida", ela é reaberta.
  if (session.status === "COMPLETED") throw new TelemetryError("closed");
  const reopen = session.status === "ABANDONED";

  const parsed = parseActivityContent(session.activity.module, session.activity.content);
  if (!parsed.success) throw new TelemetryError("invalid_item");

  let correct: boolean;
  if (parsed.name) {
    // Escrever o nome: a letra certa de cada casa vem do apelido ATUAL do aluno, no servidor.
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { displayName: true } });
    const judged = checkNameAttempt(student?.displayName ?? "", parsed.name.letterCase, input.itemKey, input.optionId);
    if (judged === null) throw new TelemetryError("invalid_item");
    correct = judged;
  } else {
    const item = parsed.items.find((i) => i.key === input.itemKey);
    if (!item || !item.options.some((o) => o.id === input.optionId)) {
      throw new TelemetryError("invalid_item");
    }
    correct = isCorrectOption(item, input.optionId);
  }

  await prisma.$transaction([
    prisma.attempt.create({
      data: {
        sessionId,
        itemKey: input.itemKey,
        correct,
        helpLevel: input.helpLevel,
        elapsedMs: input.elapsedMs,
        attemptNo: input.attemptNo,
      },
    }),
    prisma.activitySession.update({
      where: { id: sessionId },
      data: {
        totalAttempts: { increment: 1 },
        correctCount: { increment: correct ? 1 : 0 },
        redirects: { increment: correct ? 0 : 1 },
        maxHelpLevel: maxHelp(session.maxHelpLevel, input.helpLevel),
        ...(reopen ? { status: "IN_PROGRESS" as const, finishedAt: null, durationMs: null } : {}),
      },
    }),
  ]);

  return { correct };
}

/** Fecha a sessão. Idempotente: finalizar duas vezes não muda nada. */
export async function finishSession(
  studentId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<{ durationMs: number }> {
  const session = await prisma.activitySession.findFirst({
    where: { id: sessionId, studentId },
    select: { status: true, startedAt: true, durationMs: true },
  });
  if (!session) throw new TelemetryError("not_found");
  if (session.status === "COMPLETED") return { durationMs: session.durationMs ?? 0 };

  const durationMs = Math.min(Math.max(0, now.getTime() - session.startedAt.getTime()), MAX_SESSION_MS);
  await prisma.activitySession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", finishedAt: now, durationMs },
  });
  return { durationMs };
}

/**
 * Marca como INTERROMPIDAS as sessões abertas sem nenhuma resposta há mais de `staleMs`.
 * O fim da sessão é o momento da última resposta (não "agora"), então a duração não infla.
 * Roda por cron diário e também sob demanda, quando o professor abre o painel/relatório.
 */
export async function closeStaleSessions({
  now = new Date(),
  staleMs = STALE_AFTER_MS,
  studentIds,
}: { now?: Date; staleMs?: number; studentIds?: string[] } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - staleMs);
  const candidates = await prisma.activitySession.findMany({
    where: {
      status: "IN_PROGRESS",
      startedAt: { lt: cutoff },
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
    take: 200,
    select: {
      id: true,
      startedAt: true,
      attempts: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  let closed = 0;
  for (const candidate of candidates) {
    const lastActivity = candidate.attempts[0]?.createdAt ?? candidate.startedAt;
    if (lastActivity >= cutoff) continue; // houve resposta recente: a criança ainda está jogando
    const durationMs = Math.min(
      Math.max(0, lastActivity.getTime() - candidate.startedAt.getTime()),
      MAX_SESSION_MS,
    );
    // O filtro por status evita brigar com uma conclusão que aconteceu agora mesmo.
    const result = await prisma.activitySession.updateMany({
      where: { id: candidate.id, status: "IN_PROGRESS" },
      data: { status: "ABANDONED", finishedAt: lastActivity, durationMs },
    });
    closed += result.count;
  }
  return closed;
}
