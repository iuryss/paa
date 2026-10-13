import { prisma } from "@/lib/db";
import { hashSecret, verifySecret } from "@/lib/password";
import { loginLimiter } from "@/lib/rate-limit";
import { isAdultRole } from "@/lib/rbac";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; code: "wrong_current" | "rate_limited" | "forbidden" };

/** Troca a senha de quem está logado, exigindo a senha atual (limita tentativas como no login). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const key = `pwd:${userId}`;
  if (await loginLimiter.isBlocked(key)) return { ok: false, code: "rate_limited" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, role: true, active: true },
  });
  if (!user?.passwordHash || !user.active || !isAdultRole(user.role)) {
    return { ok: false, code: "forbidden" };
  }

  if (!(await verifySecret(currentPassword, user.passwordHash))) {
    await loginLimiter.fail(key);
    return { ok: false, code: "wrong_current" };
  }

  await loginLimiter.reset(key);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashSecret(newPassword) },
  });
  await prisma.auditLog.create({ data: { actorId: userId, action: "auth.password.change" } });
  return { ok: true };
}
