import { prisma } from "@/lib/db";

export interface HealthStatus {
  status: "ok" | "degraded";
  db: boolean;
}

/** Usado pelo healthcheck do container/orquestrador. Sem detalhes internos na resposta. */
export async function checkHealth(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: true };
  } catch {
    return { status: "degraded", db: false };
  }
}
