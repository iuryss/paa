import bcrypt from "bcryptjs";

const COST = 12;

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/** Hash descartável para igualar o tempo de resposta quando o usuário não existe. */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashSecret("dummy-password-for-timing-equalization");
  return dummyHash;
}
