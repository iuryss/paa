import { readFileSync } from "node:fs";
import { MAILBOX } from "../global-setup";

export interface Mail {
  at: number;
  to: string[];
  subject: string;
  /** Corpo inteiro já decodificado (quoted-printable), com texto e HTML. */
  body: string;
}

function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-F]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(joined[i]!, "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeSubject(raw: string): string {
  const header = /^Subject: (.*(?:\r?\n[ \t].*)*)/m.exec(raw)?.[1] ?? "";
  return header
    .replace(/\r?\n[ \t]+/g, "")
    .replace(/=\?UTF-8\?Q\?(.*?)\?=/gi, (_m, q: string) => decodeQuotedPrintable(q.replace(/_/g, " ")));
}

export function readMailbox(): Mail[] {
  return readFileSync(MAILBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const { at, to, raw } = JSON.parse(line) as { at: number; to: string[]; raw: string };
      return { at, to, subject: decodeSubject(raw), body: decodeQuotedPrintable(raw) };
    });
}

/** Espera chegar um e-mail para `to` com o assunto contendo `subject` (depois de `since`). */
export async function waitForMail(to: string, subject: string, since = 0, timeoutMs = 15_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = readMailbox().find((m) => m.at >= since && m.to.includes(to) && m.subject.includes(subject));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`E-mail para ${to} com assunto "${subject}" não chegou em ${timeoutMs} ms`);
}

export function mailsTo(to: string, since = 0): Mail[] {
  return readMailbox().filter((m) => m.at >= since && m.to.includes(to));
}

/** Primeiro link da plataforma no corpo do e-mail (ex.: /redefinir-senha/<token>). */
export function linkIn(mail: Mail, path: "redefinir-senha" | "convite"): string {
  const match = new RegExp(`http://localhost:3200/${path}/[A-Za-z0-9_-]{43}`).exec(mail.body);
  if (!match) throw new Error(`Link /${path}/ não encontrado no e-mail "${mail.subject}"`);
  return match[0];
}
