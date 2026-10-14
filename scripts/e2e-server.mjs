// Servidor dos testes ponta a ponta: compila a versão de PRODUÇÃO e sobe na porta E2E_PORT.
// Usa a pasta .next-e2e, então NUNCA mexe no cache do `npm run dev` (.next).
// Pule a compilação (rodadas seguidas, sem mudar o código) com E2E_SKIP_BUILD=1.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const env = { ...process.env, NEXT_DIST_DIR: ".next-e2e" };
const port = env.E2E_PORT ?? "3200";

const skipBuild = env.E2E_SKIP_BUILD === "1" && existsSync(".next-e2e/BUILD_ID");
if (!skipBuild) {
  console.log("[e2e] compilando (next build)...");
  const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env, shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

console.log(`[e2e] subindo em http://localhost:${port}`);
const server = spawn("npx", ["next", "start", "-p", port], { stdio: "inherit", env, shell: true });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
