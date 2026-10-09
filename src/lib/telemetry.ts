import { prisma } from "@/lib/db";
import { maxHelp } from "@/lib/activities/runner";
import { parseActivityContent } from "@/lib/validation/activities";
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
  if (session.status !== "IN_PROGRESS") throw new TelemetryError("closed");

  const parsed = parseActivityContent(session.activity.module, session.activity.content);
  if (!parsed.success) throw new TelemetryError("invalid_item");
  const item = parsed.items.find((i) => i.key === input.itemKey);
  if (!item || !item.options.some((o) => o.id === input.optionId)) {
    throw new TelemetryError("invalid_item");
  }

  const correct = input.optionId === item.correctId;

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
