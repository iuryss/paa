import { guidesStudent } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db";
import { savePreferences } from "@/lib/preferences";
import type { Preferences } from "@/lib/validation/preferences";

export type SaveProfileResult = { ok: true } | { ok: false; code: "not_found" };

/**
 * O adulto que acompanha o aluno define o perfil sensorial dele (tema, modo PECS, fonte, movimento, sons).
 * Sem vínculo, o aluno "não existe" para quem pergunta.
 */
export async function saveStudentProfile(
  adultId: string,
  studentId: string,
  prefs: Preferences,
): Promise<SaveProfileResult> {
  if (!(await guidesStudent(adultId, studentId))) return { ok: false, code: "not_found" };

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", active: true },
    select: { id: true },
  });
  if (!student) return { ok: false, code: "not_found" };

  await savePreferences(studentId, prefs);
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "student.profile.update", targetId: studentId },
  });
  return { ok: true };
}
