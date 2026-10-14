import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { SMTPServer } from "smtp-server";

export const MAILBOX = join(__dirname, ".tmp", "mailbox.jsonl");
const SMTP_PORT = 2526;

/** Servidor SMTP falso: guarda cada e-mail recebido em um arquivo, para os testes lerem. */
export default async function globalSetup() {
  mkdirSync(join(__dirname, ".tmp"), { recursive: true });
  writeFileSync(MAILBOX, "");

  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth(_auth, _session, callback) {
      callback(null, { user: "e2e" });
    },
    onData(stream, session, callback) {
      let raw = "";
      stream.on("data", (chunk) => (raw += chunk));
      stream.on("end", () => {
        appendFileSync(
          MAILBOX,
          JSON.stringify({ at: Date.now(), to: session.envelope.rcptTo.map((r) => r.address), raw }) + "\n",
        );
        callback();
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(SMTP_PORT, "127.0.0.1", resolve);
  });

  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
