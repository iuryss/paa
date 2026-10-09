import { prisma } from "@/lib/db";
import {
  summarizeByModule,
  summarizeSession,
  summarizeStudent,
  type ModuleSummary,
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
  const sessions = await prisma.activitySession.findMany({
    where: { studentId, status: "COMPLETED", startedAt: { gte: since } },
    orderBy: { startedAt: "asc" },
    take: MAX_SESSIONS,
    select: {
      id: true,
      startedAt: true,
      durationMs: true,
      totalAttempts: true,
      correctCount: true,
      redirects: true,
      maxHelpLevel: true,
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
      },
      attempts.filter((a) => a.sessionId === s.id),
    ),
  );
}

export interface StudentCard {
  id: string;
  displayName: string;
  summary: StudentSummary;
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
  return Promise.all(
    links.map(async ({ student }) => ({
      id: student.id,
      displayName: student.displayName,
      summary: summarizeStudent(await metricsForStudent(student.id, days, now)),
    })),
  );
}

export interface StudentReport {
  student: { id: string; displayName: string; active: boolean };
  /** Outros profissionais que também acompanham o aluno (a exclusão apaga para todos). */
  otherAdults: number;
  days: Period;
  sessions: SessionMetrics[];
  summary: StudentSummary;
  byModule: ModuleSummary[];
  assignable: { id: string; title: string; module: string }[];
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
    return {
      student,
      otherAdults: await prisma.guidance.count({ where: { studentId, adultId: { not: adultId } } }),
      days,
      sessions: [],
      summary: summarizeStudent([]),
      byModule: [],
      assignable: [],
    };
  }

  const [sessions, published, assigned, otherAdults] = await Promise.all([
    metricsForStudent(studentId, days, now),
    prisma.activity.findMany({
      where: { published: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true, module: true },
    }),
    prisma.assignment.findMany({ where: { studentId }, select: { activityId: true } }),
    prisma.guidance.count({ where: { studentId, adultId: { not: adultId } } }),
  ]);

  await prisma.auditLog.create({
    data: { actorId: adultId, action: "student.report.read", targetId: studentId },
  });

  const taken = new Set(assigned.map((a) => a.activityId));
  return {
    student,
    otherAdults,
    days,
    sessions,
    summary: summarizeStudent(sessions),
    byModule: summarizeByModule(sessions),
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
