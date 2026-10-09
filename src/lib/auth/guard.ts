import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export type GuardResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; status: 401 | 403; code: "unauthenticated" | "forbidden" };

/**
 * Defesa em profundidade: toda route handler / server action revalida o papel,
 * mesmo com o middleware já filtrando por rota.
 */
export async function guard(allowed: readonly Role[]): Promise<GuardResult> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role) return { ok: false, status: 401, code: "unauthenticated" };
  if (!allowed.includes(user.role)) return { ok: false, status: 403, code: "forbidden" };
  return { ok: true, user: { id: user.id, role: user.role } };
}
