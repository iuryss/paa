import { createHash, randomBytes } from "node:crypto";

/** 32 bytes aleatórios em base64url = 43 caracteres. */
export const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** O `token` vai no link; só o `hash` é gravado. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
