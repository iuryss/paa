import { maxHelp, type HelpLevel } from "@/lib/activities/runner";

export interface SessionInput {
  id: string;
  activityTitle: string;
  module: string;
  startedAt: Date;
  durationMs: number | null;
  totalAttempts: number;
  correctCount: number;
  redirects: number;
  maxHelpLevel: HelpLevel;
}

export interface AttemptInput {
  sessionId: string;
  itemKey: string;
  correct: boolean;
  helpLevel: HelpLevel;
  elapsedMs: number;
  attemptNo: number;
}

export interface SessionMetrics {
  id: string;
  activityTitle: string;
  module: string;
  startedAt: Date;
  durationMs: number;
  items: number;
  attempts: number;
  redirects: number;
  /** Respostas certas ÷ tentativas (0..1). */
  accuracy: number;
  /** Itens resolvidos na 1ª tentativa e sem ajuda ÷ itens (0..1). Principal indicador de autonomia. */
  independence: number;
  /** Tempo médio até acertar cada item, em ms. */
  avgItemMs: number;
  helpLevel: HelpLevel;
}

const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0);
const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Uma sessão + suas tentativas → métricas. Função pura. */
export function summarizeSession(session: SessionInput, attempts: AttemptInput[]): SessionMetrics {
  const byItem = new Map<string, AttemptInput[]>();
  for (const a of attempts) {
    byItem.set(a.itemKey, [...(byItem.get(a.itemKey) ?? []), a]);
  }

  let independent = 0;
  const solveTimes: number[] = [];
  for (const list of byItem.values()) {
    const ordered = [...list].sort((x, y) => x.attemptNo - y.attemptNo);
    const first = ordered[0];
    if (first?.correct && first.helpLevel === "NONE") independent += 1;
    const solved = ordered.find((a) => a.correct);
    if (solved) solveTimes.push(solved.elapsedMs);
  }

  return {
    id: session.id,
    activityTitle: session.activityTitle,
    module: session.module,
    startedAt: session.startedAt,
    durationMs: session.durationMs ?? 0,
    items: byItem.size,
    attempts: session.totalAttempts,
    redirects: session.redirects,
    accuracy: ratio(session.correctCount, session.totalAttempts),
    independence: ratio(independent, byItem.size),
    avgItemMs: mean(solveTimes),
    helpLevel: session.maxHelpLevel,
  };
}

export type Trend = "up" | "steady" | "down" | "insufficient";

/** Compara as últimas 3 sessões com as 3 anteriores. Menos de 4 sessões → sem tendência. */
export function trendOf(values: number[], threshold = 0.05): Trend {
  if (values.length < 4) return "insufficient";
  const recent = values.slice(-3);
  const previous = values.slice(-6, -3);
  const delta = mean(recent) - mean(previous);
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "steady";
}

export interface StudentSummary {
  sessions: number;
  items: number;
  accuracy: number;
  independence: number;
  avgItemMs: number;
  totalMs: number;
  redirects: number;
  trend: Trend;
  lastSessionAt: Date | null;
  helpDistribution: Record<HelpLevel, number>;
}

export function summarizeStudent(sessions: SessionMetrics[]): StudentSummary {
  const ordered = [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const help: Record<HelpLevel, number> = { NONE: 0, VERBAL_HINT: 0, VISUAL_HINT: 0, FULL_MODEL: 0 };
  for (const s of ordered) help[s.helpLevel] += 1;

  const withTime = ordered.filter((s) => s.avgItemMs > 0);
  return {
    sessions: ordered.length,
    items: ordered.reduce((n, s) => n + s.items, 0),
    accuracy: mean(ordered.map((s) => s.accuracy)),
    independence: mean(ordered.map((s) => s.independence)),
    avgItemMs: mean(withTime.map((s) => s.avgItemMs)),
    totalMs: ordered.reduce((n, s) => n + s.durationMs, 0),
    redirects: ordered.reduce((n, s) => n + s.redirects, 0),
    trend: trendOf(ordered.map((s) => s.independence)),
    lastSessionAt: ordered.at(-1)?.startedAt ?? null,
    helpDistribution: help,
  };
}

export interface ModuleSummary {
  module: string;
  sessions: number;
  independence: number;
  accuracy: number;
  avgItemMs: number;
}

export function summarizeByModule(sessions: SessionMetrics[]): ModuleSummary[] {
  const groups = new Map<string, SessionMetrics[]>();
  for (const s of sessions) groups.set(s.module, [...(groups.get(s.module) ?? []), s]);
  return [...groups.entries()]
    .map(([module, list]) => ({
      module,
      sessions: list.length,
      independence: mean(list.map((s) => s.independence)),
      accuracy: mean(list.map((s) => s.accuracy)),
      avgItemMs: mean(list.filter((s) => s.avgItemMs > 0).map((s) => s.avgItemMs)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export const HELP_LABEL: Record<HelpLevel, string> = {
  NONE: "Sem ajuda",
  VERBAL_HINT: "Dica escrita",
  VISUAL_HINT: "Resposta destacada",
  FULL_MODEL: "Ajuda do adulto",
};

export const MODULE_LABEL: Record<string, string> = {
  LOCALIZACAO: "Localização",
  GRAFIA: "Grafia",
  MATEMATICA: "Matemática",
  CIENCIAS: "Ciências",
  LIVRE: "Perguntas livres",
  FOLHA: "Folha de exercícios",
  NOME: "Escrever o nome",
};

export const TREND_LABEL: Record<Trend, string> = {
  up: "Mais autonomia nas últimas sessões",
  steady: "Estável nas últimas sessões",
  down: "Menos autonomia nas últimas sessões",
  insufficient: "Poucas sessões para comparar",
};

export { maxHelp };
