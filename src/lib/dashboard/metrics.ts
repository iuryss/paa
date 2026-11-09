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
  /** Dificuldade registrada quando a sessão começou (null em dados sem esse registro). */
  difficulty?: string | null;
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
  difficulty: string | null;
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
    difficulty: session.difficulty ?? null,
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

interface Aggregate {
  sessions: number;
  independence: number;
  accuracy: number;
  avgItemMs: number;
}

function aggregate(list: SessionMetrics[]): Aggregate {
  return {
    sessions: list.length,
    independence: mean(list.map((s) => s.independence)),
    accuracy: mean(list.map((s) => s.accuracy)),
    avgItemMs: mean(list.filter((s) => s.avgItemMs > 0).map((s) => s.avgItemMs)),
  };
}

function groupBy<K>(sessions: SessionMetrics[], key: (s: SessionMetrics) => K): Map<K, SessionMetrics[]> {
  const groups = new Map<K, SessionMetrics[]>();
  for (const s of sessions) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return groups;
}

export function summarizeByModule(sessions: SessionMetrics[]): ModuleSummary[] {
  return [...groupBy(sessions, (s) => s.module).entries()]
    .map(([module, list]) => ({ module, ...aggregate(list) }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

// ───────────── Relatório detalhado ─────────────

const DIFFICULTY_ORDER = ["INICIAL", "INTERMEDIARIO", "AVANCADO"];

export interface DifficultySummary extends Aggregate {
  /** null = sessão sem a dificuldade registrada. */
  difficulty: string | null;
}

/** Resultados por nível de dificuldade, do mais fácil ao mais difícil. */
export function summarizeByDifficulty(sessions: SessionMetrics[]): DifficultySummary[] {
  const rank = (d: string | null) => {
    const i = d === null ? -1 : DIFFICULTY_ORDER.indexOf(d);
    return i === -1 ? DIFFICULTY_ORDER.length : i;
  };
  return [...groupBy(sessions, (s) => s.difficulty).entries()]
    .map(([difficulty, list]) => ({ difficulty, ...aggregate(list) }))
    .sort((a, b) => rank(a.difficulty) - rank(b.difficulty));
}

export interface ActivitySummary extends Aggregate {
  title: string;
  module: string;
  lastAt: Date;
}

/** Resultados por atividade, da menor autonomia para a maior: onde o aluno mais precisa de apoio vem primeiro. */
export function summarizeByActivity(sessions: SessionMetrics[]): ActivitySummary[] {
  return [...groupBy(sessions, (s) => `${s.module}|${s.activityTitle}`).values()]
    .map((list) => ({
      title: list[0]!.activityTitle,
      module: list[0]!.module,
      lastAt: new Date(Math.max(...list.map((s) => s.startedAt.getTime()))),
      ...aggregate(list),
    }))
    .sort((a, b) => a.independence - b.independence || a.title.localeCompare(b.title));
}

export interface Snapshot {
  sessions: number;
  from: Date;
  to: Date;
  independence: number;
  accuracy: number;
  avgItemMs: number;
  /** Sessões em que o adulto precisou ajudar (ajuda máxima) ÷ sessões. */
  adultHelpShare: number;
}

function snapshot(list: SessionMetrics[]): Snapshot {
  return {
    ...aggregate(list),
    from: list[0]!.startedAt,
    to: list.at(-1)!.startedAt,
    adultHelpShare: ratio(list.filter((s) => s.helpLevel === "FULL_MODEL").length, list.length),
  };
}

/** Mínimo de sessões concluídas para comparar o início com agora (2 de cada lado). */
export const START_VS_NOW_MIN = 4;

export type StartVsNow =
  | { status: "insufficient"; total: number; needed: number }
  | { status: "ok"; total: number; start: Snapshot; now: Snapshot };

/**
 * Compara as primeiras sessões concluídas do aluno (desde sempre) com as mais recentes.
 * Usa até `window` sessões de cada lado, sem que os dois grupos se sobreponham.
 * `earliest` e `latest` podem vir em qualquer ordem; `total` é quantas sessões concluídas existem.
 */
export function startVsNow(
  earliest: SessionMetrics[],
  latest: SessionMetrics[],
  total: number,
  window = 3,
): StartVsNow {
  if (total < START_VS_NOW_MIN) return { status: "insufficient", total, needed: START_VS_NOW_MIN };
  const n = Math.min(window, Math.floor(total / 2));
  const byDate = (a: SessionMetrics, b: SessionMetrics) => a.startedAt.getTime() - b.startedAt.getTime();
  return {
    status: "ok",
    total,
    start: snapshot([...earliest].sort(byDate).slice(0, n)),
    now: snapshot([...latest].sort(byDate).slice(-n)),
  };
}

const TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Data local (São Paulo) como "AAAA-MM-DD". */
export function localDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Segunda-feira da semana (horário de São Paulo), às 12h UTC: qualquer fuso do Brasil mostra o mesmo dia. */
export function weekStart(date: Date): Date {
  const day = new Date(`${localDay(date)}T12:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

export interface WeekHelp {
  weekStart: Date;
  sessions: number;
  help: Record<HelpLevel, number>;
  /** Sessões sem nenhuma ajuda ÷ sessões da semana. */
  noHelpShare: number;
  independence: number;
}

/** Ajuda usada semana a semana: mostra se o apoio do adulto está diminuindo com o tempo. */
export function helpByWeek(sessions: SessionMetrics[]): WeekHelp[] {
  return [...groupBy(sessions, (s) => weekStart(s.startedAt).getTime()).entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const help: Record<HelpLevel, number> = { NONE: 0, VERBAL_HINT: 0, VISUAL_HINT: 0, FULL_MODEL: 0 };
      for (const s of list) help[s.helpLevel] += 1;
      return {
        weekStart: new Date(week),
        sessions: list.length,
        help,
        noHelpShare: ratio(help.NONE, list.length),
        independence: mean(list.map((s) => s.independence)),
      };
    });
}

export interface Engagement {
  completed: number;
  interrupted: number;
  /** Concluídas ÷ iniciadas (0..1); null quando nenhuma sessão começou. */
  completionRate: number | null;
  sessionsPerWeek: number;
  /** Dias diferentes com pelo menos uma sessão concluída. */
  activeDays: number;
  avgSessionMs: number;
}

export function engagementOf(sessions: SessionMetrics[], interrupted: number, days: number): Engagement {
  const started = sessions.length + interrupted;
  return {
    completed: sessions.length,
    interrupted,
    completionRate: started > 0 ? sessions.length / started : null,
    sessionsPerWeek: ratio(sessions.length, days / 7),
    activeDays: new Set(sessions.map((s) => localDay(s.startedAt))).size,
    avgSessionMs: mean(sessions.map((s) => s.durationMs)),
  };
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  INICIAL: "Inicial",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

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
