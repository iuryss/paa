import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { closeStaleSessions } from "@/lib/telemetry";
import {
  summarizeByModule,
  summarizeSession,
  summarizeStudent,
  type ActivitySummary,
  type DifficultySummary,
  type Engagement,
  type ModuleSummary,
  type StartVsNow,
  type WeekHelp,
  engagementOf,
  helpByWeek,
  startVsNow,
  summarizeByActivity,
  summarizeByDifficulty,
  type SessionMetrics,
  type StudentSummary,
} from "@/lib/dashboard/metrics";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(raw: unknown): Period {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

const MAX_SESSIONS = 200;

/** O adulto só enxerga alunos com vínculo (Guidance). Base de toda consulta do painel. */
export async function guidesStudent(adultId: string, studentId: string): Promise<boolean> {
  const row = await prisma.guidance.findUnique({
    where: { adultId_studentId: { adultId, studentId } },
    select: { id: true },
  });
  return row !== null;
}

async function metricsForStudent(studentId: string, days: Period, now: Date): Promise<SessionMetrics[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return loadMetrics({ studentId, status: "COMPLETED", startedAt: { gte: since } }, "asc", MAX_SESSIONS);
}

/** Sessões que batem com `where` → métricas, já com as tentativas de cada uma. */
async function loadMetrics(
  where: Prisma.ActivitySessionWhereInput,
  order: "asc" | "desc",
  take: number,
): Promise<SessionMetrics[]> {
  const sessions = await prisma.activitySession.findMany({
    where,
    orderBy: { startedAt: order },
    take,
    select: {
      id: true,
      startedAt: true,
      durationMs: true,
      totalAttempts: true,
      correctCount: true,
      redirects: true,
      maxHelpLevel: true,
      difficultyUsed: true,
      activity: { select: { title: true, module: true } },
    },
  });
  if (sessions.length === 0) return [];

  const attempts = await prisma.attempt.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) } },
    select: {
      sessionId: true,
      itemKey: true,
      correct: true,
      helpLevel: true,
      elapsedMs: true,
      attemptNo: true,
    },
  });

  return sessions.map((s) =>
    summarizeSession(
      {
        id: s.id,
        activityTitle: s.activity.title,
        module: s.activity.module,
        startedAt: s.startedAt,
        durationMs: s.durationMs,
        totalAttempts: s.totalAttempts,
        correctCount: s.correctCount,
        redirects: s.redirects,
        maxHelpLevel: s.maxHelpLevel,
        difficulty: s.difficultyUsed,
      },
      attempts.filter((a) => a.sessionId === s.id),
    ),
  );
}

export interface StudentCard {
  id: string;
  displayName: string;
  summary: StudentSummary;
  /** Sessões que a criança começou e não terminou, no período. */
  interrupted: number;
}

/** Visão geral: alunos do adulto com o resumo do período. Só apelido, nunca PII. */
export async function getStudentsOverview(
  adultId: string,
  days: Period = 30,
  now: Date = new Date(),
): Promise<StudentCard[]> {
  const links = await prisma.guidance.findMany({
    where: { adultId, student: { active: true } },
    orderBy: { createdAt: "asc" },
    select: { student: { select: { id: true, displayName: true } } },
  });
  const ids = links.map((l) => l.student.id);
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Fecha as sessões abandonadas antes de contar (o cron diário cobre quem ninguém abriu).
  await closeStaleSessions({ now, studentIds: ids });
  const interrupted = ids.length
    ? await prisma.activitySession.groupBy({
        by: ["studentId"],
        where: { studentId: { in: ids }, status: "ABANDONED", startedAt: { gte: since } },
        _count: { _all: true },
      })
    : [];
  const interruptedBy = new Map(interrupted.map((g) => [g.studentId, g._count._all]));

  return Promise.all(
    links.map(async ({ student }) => ({
      id: student.id,
      displayName: student.displayName,
      summary: summarizeStudent(await metricsForStudent(student.id, days, now)),
      interrupted: interruptedBy.get(student.id) ?? 0,
    })),
  );
}

export interface InterruptedSession {
  id: string;
  activityTitle: string;
  startedAt: Date;
  durationMs: number;
  attempts: number;
}

async function interruptedForStudent(studentId: string, days: Period, now: Date): Promise<InterruptedSession[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.activitySession.findMany({
    where: { studentId, status: "ABANDONED", startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      startedAt: true,
      durationMs: true,
      totalAttempts: true,
      activity: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    activityTitle: r.activity.title,
    startedAt: r.startedAt,
    durationMs: r.durationMs ?? 0,
    attempts: r.totalAttempts,
  }));
}

/** Primeiras × últimas sessões concluídas desde o início, sem depender do período escolhido. */
async function startVsNowFor(studentId: string): Promise<StartVsNow> {
  const where = { studentId, status: "COMPLETED" as const };
  const [earliest, latest, total] = await Promise.all([
    loadMetrics(where, "asc", 3),
    loadMetrics(where, "desc", 3),
    prisma.activitySession.count({ where }),
  ]);
  return startVsNow(earliest, latest, total);
}

function abandonedCount(studentId: string, days: Period, now: Date): Promise<number> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return prisma.activitySession.count({ where: { studentId, status: "ABANDONED", startedAt: { gte: since } } });
}

export interface StudentReport {
  student: { id: string; displayName: string; active: boolean };
  /** Outros profissionais que também acompanham o aluno (a exclusão apaga para todos). */
  otherAdults: number;
  days: Period;
  sessions: SessionMetrics[];
  /** Sessões não terminadas: ficam FORA dos gráficos de autonomia (são parciais). */
  interrupted: InterruptedSession[];
  summary: StudentSummary;
  byModule: ModuleSummary[];
  /** Começo do uso × agora (desde a primeira sessão, independente do período). */
  startVsNow: StartVsNow;
  byDifficulty: DifficultySummary[];
  /** Da menor autonomia para a maior. */
  byActivity: ActivitySummary[];
  weeks: WeekHelp[];
  engagement: Engagement;
  assignable: { id: string; title: string; module: string }[];
  /** Adultos que acompanham o aluno, do vínculo mais antigo ao mais novo. */
  team: StudentTeamMember[];
  /** O que já foi atribuído, e por quem, para os colegas não repetirem o trabalho. */
  assigned: AssignedActivity[];
}

export interface StudentTeamMember {
  id: string;
  displayName: string;
  role: Role;
}

export interface AssignedActivity {
  id: string;
  title: string;
  module: string;
  assignedAt: Date;
  assignedByName: string;
  assignedByYou: boolean;
}

async function teamOfStudent(studentId: string): Promise<StudentTeamMember[]> {
  const links = await prisma.guidance.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
    select: { adult: { select: { id: true, displayName: true, role: true } } },
  });
  return links.map((l) => l.adult);
}

/** Relatório de evolução de um aluno. Retorna null se o adulto não acompanha esse aluno. */
export async function getStudentReport(
  adultId: string,
  studentId: string,
  days: Period = 30,
  now: Date = new Date(),
): Promise<StudentReport | null> {
  if (!(await guidesStudent(adultId, studentId))) return null;

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: { id: true, displayName: true, active: true },
  });
  if (!student) return null;

  // Aluno desativado (consentimento revogado): nenhum dado de desempenho é lido ou exibido.
  if (!student.active) {
    await prisma.auditLog.create({
      data: { actorId: adultId, action: "student.report.read", targetId: studentId },
    });
    const team = await teamOfStudent(studentId);
    return {
      student,
      otherAdults: team.length - 1,
      team,
      assigned: [],
      days,
      sessions: [],
      interrupted: [],
      summary: summarizeStudent([]),
      byModule: [],
      startVsNow: startVsNow([], [], 0),
      byDifficulty: [],
      byActivity: [],
      weeks: [],
      engagement: engagementOf([], 0, days),
      assignable: [],
    };
  }

  await closeStaleSessions({ now, studentIds: [studentId] });

  const [sessions, interrupted, abandoned, comparison, published, assignments, team] = await Promise.all([
    metricsForStudent(studentId, days, now),
    interruptedForStudent(studentId, days, now),
    abandonedCount(studentId, days, now),
    startVsNowFor(studentId),
    prisma.activity.findMany({
      where: { published: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true, module: true },
    }),
    prisma.assignment.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: {
        activityId: true,
        assignedBy: true,
        createdAt: true,
        activity: { select: { title: true, module: true, published: true } },
        assigner: { select: { displayName: true } },
      },
    }),
    teamOfStudent(studentId),
  ]);

  await prisma.auditLog.create({
    data: { actorId: adultId, action: "student.report.read", targetId: studentId },
  });

  const taken = new Set(assignments.map((a) => a.activityId));
  return {
    student,
    otherAdults: team.length - 1,
    team,
    assigned: assignments
      .filter((a) => a.activity.published)
      .map((a) => ({
        id: a.activityId,
        title: a.activity.title,
        module: a.activity.module,
        assignedAt: a.createdAt,
        assignedByName: a.assigner.displayName,
        assignedByYou: a.assignedBy === adultId,
      })),
    days,
    sessions,
    interrupted,
    summary: summarizeStudent(sessions),
    byModule: summarizeByModule(sessions),
    startVsNow: comparison,
    byDifficulty: summarizeByDifficulty(sessions),
    byActivity: summarizeByActivity(sessions),
    weeks: helpByWeek(sessions),
    engagement: engagementOf(sessions, abandoned, days),
    assignable: published.filter((a) => !taken.has(a.id)),
  };
}

/** Alunos acompanhados com acesso desativado (consentimento revogado). Só o apelido; nenhum dado de uso. */
export async function getInactiveStudents(adultId: string): Promise<{ id: string; displayName: string }[]> {
  const links = await prisma.guidance.findMany({
    where: { adultId, student: { active: false } },
    orderBy: { createdAt: "asc" },
    select: { student: { select: { id: true, displayName: true } } },
  });
  return links.map((l) => l.student);
}
