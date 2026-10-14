import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth/cron";
import { logger } from "@/lib/logger";
import { closeStaleSessions } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/** Limpeza diária (vercel.json): fecha como "interrompidas" as sessões abandonadas. Protegida por CRON_SECRET. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const closed = await closeStaleSessions();
  logger.info("cron.sessions_closed", { closed });
  return NextResponse.json({ closed }, { headers: { "Cache-Control": "no-store" } });
}
