type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Chaves que nunca podem aparecer em log (PII / segredos). */
const REDACTED_KEYS = new Set([
  "email",
  "password",
  "pin",
  "passwordhash",
  "pinhash",
  "studentcode",
  "token",
  "authorization",
  "cookie",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACTED_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v, depth + 1),
    ]),
  );
}

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[level] ?? ORDER.info;
}

function write(level: Level, event: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test" || ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
  });
  (level === "error" ? console.error : console.log)(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
