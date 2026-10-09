"use server";

import { guard } from "@/lib/auth/guard";
import { logger } from "@/lib/logger";
import { finishSession, recordAttempt, startSession, TelemetryError } from "@/lib/telemetry";
import { idSchema } from "@/lib/validation/activities";
import { attemptInputSchema } from "@/lib/validation/telemetry";

type Ok<T = object> = ({ ok: true } & T) | { ok: false };

/** Nenhuma ação lança para o cliente: telemetria nunca pode travar a criança. */
async function run<T extends object>(
  fn: (studentId: string) => Promise<T>,
): Promise<Ok<T>> {
  const access = await guard(["STUDENT"]);
  if (!access.ok) return { ok: false };
  try {
    return { ok: true, ...(await fn(access.user.id)) };
  } catch (error) {
    if (!(error instanceof TelemetryError)) logger.error("telemetry.failed");
    return { ok: false };
  }
}

export async function startSessionAction(activityId: unknown): Promise<Ok<{ sessionId: string }>> {
  const id = idSchema.safeParse(activityId);
  if (!id.success) return { ok: false };
  return run((studentId) => startSession(studentId, id.data));
}

export async function recordAttemptAction(
  sessionId: unknown,
  attempt: unknown,
): Promise<Ok<{ correct: boolean }>> {
  const id = idSchema.safeParse(sessionId);
  const input = attemptInputSchema.safeParse(attempt);
  if (!id.success || !input.success) return { ok: false };
  return run((studentId) => recordAttempt(studentId, id.data, input.data));
}

export async function finishSessionAction(sessionId: unknown): Promise<Ok<{ durationMs: number }>> {
  const id = idSchema.safeParse(sessionId);
  if (!id.success) return { ok: false };
  return run((studentId) => finishSession(studentId, id.data));
}
