import { guidesStudent } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db";
import { TERMS_VERSION } from "@/lib/terms";

export type LifecycleResult = { ok: true } | { ok: false; code: "not_found" };
export type DeleteResult = { ok: true } | { ok: false; code: "not_found" | "confirmation_mismatch" };

/** O adulto só mexe em aluno que acompanha; para os demais, o aluno "não existe". */
async function findGuidedStudent(adultId: string, studentId: string) {
  if (!(await guidesStudent(adultId, studentId))) return null;
  return prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT" },
    select: { id: true, displayName: true },
  });
}

/**
 * Revoga o consentimento do responsável (LGPD art. 8º §5º). Efeito imediato:
 * a conta é desativada (a sessão aberta cai na próxima leitura) e o aluno sai dos painéis.
 * Os dados ficam retidos, sem uso, só até a exclusão ou um novo consentimento.
 */
export async function revokeConsent(
  adultId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<LifecycleResult> {
  if (!(await findGuidedStudent(adultId, studentId))) return { ok: false, code: "not_found" };

  await prisma.$transaction(async (tx) => {
    await tx.consentRecord.updateMany({
      where: { studentId, status: "GRANTED" },
      data: { status: "REVOKED", revokedAt: now },
    });
    await tx.user.update({ where: { id: studentId }, data: { active: false } });
    await tx.auditLog.create({
      data: { actorId: adultId, action: "student.consent.revoke", targetId: studentId },
    });
  });
  return { ok: true };
}

/** Registra um novo consentimento (versão atual do termo) e reativa o acesso do aluno. */
export async function grantConsent(
  adultId: string,
  studentId: string,
  termsVersion: string = TERMS_VERSION,
): Promise<LifecycleResult> {
  if (!(await findGuidedStudent(adultId, studentId))) return { ok: false, code: "not_found" };

  await prisma.$transaction(async (tx) => {
    await tx.consentRecord.create({ data: { studentId, grantedBy: adultId, termsVersion } });
    await tx.user.update({ where: { id: studentId }, data: { active: true } });
    await tx.auditLog.create({
      data: { actorId: adultId, action: "student.consent.grant", targetId: studentId },
    });
  });
  return { ok: true };
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

/**
 * Exclusão definitiva (LGPD art. 18, VI). Exige digitar o apelido do aluno.
 * O banco apaga em cascata: perfil sensorial, vínculos, atribuições, sessões, tentativas e consentimentos.
 * Fica apenas o registro de auditoria "student.delete" com o id (sem nome, código ou qualquer dado do aluno).
 */
export async function deleteStudent(
  adultId: string,
  studentId: string,
  confirmName: string,
): Promise<DeleteResult> {
  const student = await findGuidedStudent(adultId, studentId);
  if (!student) return { ok: false, code: "not_found" };
  if (normalize(confirmName) !== normalize(student.displayName)) {
    return { ok: false, code: "confirmation_mismatch" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: { actorId: adultId, action: "student.delete", targetId: studentId },
    });
    await tx.user.delete({ where: { id: studentId } });
  });
  return { ok: true };
}
