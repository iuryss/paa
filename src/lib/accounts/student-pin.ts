import { guidesStudent } from "@/lib/dashboard/queries";
import { prisma } from "@/lib/db";
import { hashSecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { generatePin } from "@/lib/student-credentials";

export type ResetPinResult =
  | { ok: true; pin: string; studentCode: string; displayName: string }
  | { ok: false; code: "not_found" };

/**
 * Gera um PIN novo para o aluno. Só quem acompanha o aluno pode. O PIN antigo deixa de valer,
 * o bloqueio por tentativas é limpo (a criança pode estar bloqueada por errar o PIN esquecido)
 * e o PIN novo só aparece nesta resposta.
 */
export async function resetStudentPin(adultId: string, studentId: string): Promise<ResetPinResult> {
  if (!(await guidesStudent(adultId, studentId))) return { ok: false, code: "not_found" };

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "STUDENT", active: true },
    select: { studentCode: true, displayName: true },
  });
  if (!student?.studentCode) return { ok: false, code: "not_found" };

  const pin = generatePin();
  await prisma.user.update({ where: { id: studentId }, data: { pinHash: await hashSecret(pin) } });
  await loginLimiter.reset(`student:${student.studentCode}`);
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "student.pin.reset", targetId: studentId },
  });

  return { ok: true, pin, studentCode: student.studentCode, displayName: student.displayName };
}
