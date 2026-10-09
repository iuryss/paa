import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * A conta ainda pode usar o sistema? Consultado a cada leitura de sessão (não só no login), para que
 * desativar um aluno / revogar o consentimento derrube a sessão na hora, e não só após as 8 h do JWT.
 * Falha fechada: se não der para confirmar, a sessão não é considerada válida.
 */
export async function isAccountActive(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
    return user?.active === true;
  } catch {
    logger.error("session.active_check_failed");
    return false;
  }
}
