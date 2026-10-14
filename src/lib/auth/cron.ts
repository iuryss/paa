import { timingSafeEqual } from "node:crypto";

/** O Vercel Cron envia `Authorization: Bearer <CRON_SECRET>` quando a variável existe no projeto. */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false; // sem segredo forte configurado, ninguém entra
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
