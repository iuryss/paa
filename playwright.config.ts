import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const SMTP_PORT = 2526;

/** Banco SÓ de testes: nunca o de desenvolvimento. Em CI vem da variável E2E_DATABASE_URL. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://tea:tea_dev_password@localhost:5433/tea_platform_e2e?schema=public";

export default defineConfig({
  testDir: "./e2e",
  // Um teste por vez: todos usam o mesmo banco e o mesmo servidor.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Compila e sobe a versão de PRODUÇÃO (a mesma que vai para a Vercel), numa pasta própria (.next-e2e).
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    env: {
      E2E_PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret-com-mais-de-trinta-e-dois-caracteres",
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: "true",
      CRON_SECRET: "e2e-cron-secret-0123456789",
      // E-mail de verdade (SMTP), só que para um servidor falso local que guarda as mensagens.
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(SMTP_PORT),
      SMTP_SECURE: "false",
      SMTP_USER: "e2e",
      SMTP_PASS: "e2e-pass",
      EMAIL_FROM: "Plataforma TEA <nao-responda@e2e.test>",
      LEGAL_CONTROLLER_NAME: "Escola E2E",
      LEGAL_DPO_EMAIL: "privacidade@e2e.test",
      LEGAL_REVIEWED: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
