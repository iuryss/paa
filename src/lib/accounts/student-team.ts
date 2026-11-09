import type { Role } from "@prisma/client";
import { guidesStudent } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db";
import { describeEmailFailure } from "@/lib/email/diagnose";
import { sendEmail } from "@/lib/email/send";
import { studentSharedEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { createLimiter, defaultStore } from "@/lib/rate-limit";
import { isAdultRole } from "@/lib/rbac";

/** No máximo 30 tentativas de adicionar por hora por adulto: evita sondar e-mails e repetir avisos. */
export const teamLimiter = createLimiter(30, 60 * 60 * 1000, defaultStore, "student-team");

export type AddAdultResult =
  | { ok: true; adult: { id: string; displayName: string; role: Role; email: string } }
  | { ok: false; code: "not_found" | "student_inactive" | "unknown_email" | "already_linked" };

/**
 * Vincula outro adulto a um aluno. Todos os vinculados têm os mesmos poderes, então só quem já
 * acompanha o aluno pode adicionar. Com o consentimento revogado, ninguém novo passa a ter acesso.
 */
export async function addAdultToStudent(actorId: string, studentId: string, email: string): Promise<AddAdultResult> {
  if (!(await guidesStudent(actorId, studentId))) return { ok: false, code: "not_found" };

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: { active: true },
  });
  if (!student) return { ok: false, code: "not_found" };
  if (!student.active) return { ok: false, code: "student_inactive" };

  const adult = await prisma.user.findUnique({
    where: { email },
    select: { id: true, displayName: true, role: true, active: true },
  });
  if (!adult || !adult.active || !isAdultRole(adult.role)) return { ok: false, code: "unknown_email" };

  const created = await prisma.$transaction(async (tx) => {
    const { count } = await tx.guidance.createMany({
      data: [{ adultId: adult.id, studentId }],
      skipDuplicates: true,
    });
    if (count === 1) {
      await tx.auditLog.create({
        data: { actorId, action: "student.team.add", targetId: studentId, meta: { adultId: adult.id } },
      });
    }
    return count === 1;
  });
  if (!created) return { ok: false, code: "already_linked" };

  return { ok: true, adult: { id: adult.id, displayName: adult.displayName, role: adult.role, email } };
}

/** Avisa o colega. Sem o apelido da criança, porque e-mail sai do nosso sistema. Falha não desfaz o vínculo. */
export async function emailStudentShared(args: {
  actorId: string;
  to: string;
  name: string;
  link: string;
}): Promise<boolean> {
  try {
    const actor = await prisma.user.findUnique({ where: { id: args.actorId }, select: { displayName: true } });
    await sendEmail(
      studentSharedEmail({
        to: args.to,
        name: args.name,
        actorName: actor?.displayName ?? "Um colega",
        link: args.link,
      }),
    );
    return true;
  } catch (error) {
    const { code, status } = describeEmailFailure(error);
    logger.error("student_team.email_failed", { code, status });
    return false;
  }
}

export type RemoveAdultResult = { ok: true } | { ok: false; code: "not_found" | "last_adult" };

/**
 * Remove um adulto do aluno; `actorId === adultId` é sair do acompanhamento. Qualquer vinculado pode
 * remover, mas o aluno nunca fica sem ninguém: o último adulto precisa excluir o aluno.
 *
 * O bloqueio da linha do aluno serializa remoções simultâneas. Sem ele, dois adultos removendo um ao
 * outro veriam dois vínculos e apagariam ambos.
 */
export async function removeAdultFromStudent(
  actorId: string,
  studentId: string,
  adultId: string,
): Promise<RemoveAdultResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${studentId} FOR UPDATE`;

    const links = await tx.guidance.findMany({ where: { studentId }, select: { adultId: true } });
    const linked = new Set(links.map((l) => l.adultId));
    if (!linked.has(actorId) || !linked.has(adultId)) return { ok: false, code: "not_found" } as const;
    if (linked.size <= 1) return { ok: false, code: "last_adult" } as const;

    await tx.guidance.delete({ where: { adultId_studentId: { adultId, studentId } } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: actorId === adultId ? "student.team.leave" : "student.team.remove",
        targetId: studentId,
        meta: { adultId },
      },
    });
    return { ok: true } as const;
  });
}
