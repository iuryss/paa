import { guidesStudent } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db";

export interface StudentExport {
  geradoEm: string;
  observacao: string;
  aluno: { apelido: string; codigoDeAcesso: string | null; ativo: boolean; criadoEm: string };
  perfilSensorial: Record<string, unknown> | null;
  consentimentos: { versaoDoTermo: string; situacao: string; registradoEm: string; revogadoEm: string | null }[];
  atividadesAtribuidas: { atividade: string; modulo: string; atribuidaEm: string }[];
  sessoes: {
    inicio: string;
    fim: string | null;
    duracaoMs: number | null;
    atividade: string;
    modulo: string;
    situacao: string;
    tentativas: number;
    acertos: number;
    redirecionamentos: number;
    maiorAjuda: string;
    temaUsado: string | null;
    modoUsado: string | null;
    respostas: {
      item: string;
      acertou: boolean;
      ajuda: string;
      tempoMs: number;
      numeroDaTentativa: number;
      em: string;
    }[];
  }[];
}

export type ExportResult =
  | { ok: true; data: StudentExport; filename: string }
  | { ok: false; code: "not_found" };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "aluno"
  );
}

/**
 * Cópia dos dados do aluno em formato legível por máquina (LGPD art. 18, II e V).
 * O PIN nunca entra (só existe o hash, e hash também é segredo). Cada exportação gera um registro de auditoria.
 */
export async function exportStudentData(
  adultId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<ExportResult> {
  if (!(await guidesStudent(adultId, studentId))) return { ok: false, code: "not_found" };

  const s = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: {
      displayName: true,
      studentCode: true,
      active: true,
      createdAt: true,
      sensoryProfile: {
        select: { theme: true, contentMode: true, fontFamily: true, reducedMotion: true, soundEnabled: true },
      },
      consents: {
        orderBy: { createdAt: "asc" },
        select: { termsVersion: true, status: true, createdAt: true, revokedAt: true },
      },
      assignments: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, activity: { select: { title: true, module: true } } },
      },
      sessions: {
        orderBy: { startedAt: "asc" },
        select: {
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          status: true,
          totalAttempts: true,
          correctCount: true,
          redirects: true,
          maxHelpLevel: true,
          themeUsed: true,
          contentModeUsed: true,
          activity: { select: { title: true, module: true } },
          attempts: {
            orderBy: { createdAt: "asc" },
            select: { itemKey: true, correct: true, helpLevel: true, elapsedMs: true, attemptNo: true, createdAt: true },
          },
        },
      },
    },
  });
  if (!s) return { ok: false, code: "not_found" };

  await prisma.auditLog.create({
    data: { actorId: adultId, action: "student.export", targetId: studentId },
  });

  const data: StudentExport = {
    geradoEm: now.toISOString(),
    observacao:
      "Cópia dos dados do aluno na Plataforma TEA. O PIN de acesso não é incluído por segurança. " +
      "Guarde este arquivo com cuidado: ele contém dados pessoais de uma criança.",
    aluno: { apelido: s.displayName, codigoDeAcesso: s.studentCode, ativo: s.active, criadoEm: s.createdAt.toISOString() },
    perfilSensorial: s.sensoryProfile,
    consentimentos: s.consents.map((c) => ({
      versaoDoTermo: c.termsVersion,
      situacao: c.status,
      registradoEm: c.createdAt.toISOString(),
      revogadoEm: iso(c.revokedAt),
    })),
    atividadesAtribuidas: s.assignments.map((a) => ({
      atividade: a.activity.title,
      modulo: a.activity.module,
      atribuidaEm: a.createdAt.toISOString(),
    })),
    sessoes: s.sessions.map((x) => ({
      inicio: x.startedAt.toISOString(),
      fim: iso(x.finishedAt),
      duracaoMs: x.durationMs,
      atividade: x.activity.title,
      modulo: x.activity.module,
      situacao: x.status,
      tentativas: x.totalAttempts,
      acertos: x.correctCount,
      redirecionamentos: x.redirects,
      maiorAjuda: x.maxHelpLevel,
      temaUsado: x.themeUsed,
      modoUsado: x.contentModeUsed,
      respostas: x.attempts.map((t) => ({
        item: t.itemKey,
        acertou: t.correct,
        ajuda: t.helpLevel,
        tempoMs: t.elapsedMs,
        numeroDaTentativa: t.attemptNo,
        em: t.createdAt.toISOString(),
      })),
    })),
  };

  return { ok: true, data, filename: `dados-${slug(s.displayName)}-${now.toISOString().slice(0, 10)}.json` };
}
