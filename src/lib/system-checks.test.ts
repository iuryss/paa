import { runSystemChecks } from "./system-checks";

const prodEnv = {
  NODE_ENV: "production",
  AUTH_URL: "https://app.escola.com.br",
  AUTH_SECRET: "x".repeat(40),
  CRON_SECRET: "c".repeat(32),
  EMAIL_PROVIDER: "gmail",
  GMAIL_USER: "plataforma.escola@gmail.com",
  GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
  LEGAL_CONTROLLER_NAME: "Escola Girassol",
  LEGAL_DPO_EMAIL: "dpo@escola.com.br",
  LEGAL_REVIEWED: "true",
};

const healthy = { checkDb: async () => true, pingRedis: async () => true as boolean | null, backend: "redis" as const };

const byId = (checks: Awaited<ReturnType<typeof runSystemChecks>>) => Object.fromEntries(checks.map((c) => [c.id, c]));

describe("runSystemChecks", () => {
  it("produção totalmente configurada: tudo ok", async () => {
    const checks = await runSystemChecks({ env: prodEnv, ...healthy });
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(byId(checks)["auth-url"]?.detail).toBe("https://app.escola.com.br");
  });

  it("produção SEM Redis: avisa que o limite de login não protege entre instâncias", async () => {
    const c = byId(await runSystemChecks({ env: prodEnv, ...healthy, backend: "memory" }));
    expect(c["rate-limit"]).toMatchObject({ status: "warn" });
    expect(c["rate-limit"]?.detail).toMatch(/Upstash/);
  });

  it("em desenvolvimento a memória é aceitável", async () => {
    const c = byId(await runSystemChecks({ env: { NODE_ENV: "development", AUTH_SECRET: "x".repeat(40), AUTH_URL: "http://localhost:3000" }, ...healthy, backend: "memory" }));
    expect(c["rate-limit"]?.status).toBe("ok");
    expect(c["email"]?.status).toBe("ok"); // modo terminal
    expect(c["email"]?.detail).toMatch(/nada é enviado/);
  });

  it("Redis configurado mas fora do ar", async () => {
    const c = byId(await runSystemChecks({ env: prodEnv, ...healthy, pingRedis: async () => false }));
    expect(c["rate-limit"]).toMatchObject({ status: "warn" });
    expect(c["rate-limit"]?.detail).toMatch(/memória como reserva/);
  });

  it("banco sem conexão", async () => {
    const c = byId(await runSystemChecks({ env: prodEnv, ...healthy, checkDb: async () => false }));
    expect(c["db"]?.status).toBe("warn");
    const thrown = byId(await runSystemChecks({ env: prodEnv, ...healthy, checkDb: async () => { throw new Error("x"); } }));
    expect(thrown["db"]?.status).toBe("warn");
  });

  it("Gmail em produção: ok, mostra o endereço mascarado e NUNCA a senha de app", async () => {
    const env = { NODE_ENV: "production", AUTH_URL: "https://x.vercel.app", AUTH_SECRET: "x".repeat(40), GMAIL_USER: "plataforma.paa@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };
    const checks = await runSystemChecks({ env, ...healthy });
    const email = byId(checks)["email"]!;
    expect(email.status).toBe("ok");
    expect(email.detail).toContain("Gmail configurado (p***@gmail.com)");
    const text = JSON.stringify(checks);
    expect(text).not.toContain("abcd");
    expect(text).not.toContain("plataforma.paa");
  });

  it("Gmail com a senha de app curta: aponta o nome da variável", async () => {
    const env = { NODE_ENV: "production", EMAIL_PROVIDER: "gmail", GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "curta" };
    const email = byId(await runSystemChecks({ env, ...healthy }))["email"]!;
    expect(email.status).toBe("warn");
    expect(email.detail).toContain("GMAIL_APP_PASSWORD");
  });

  it("SMTP genérico mostra o servidor", async () => {
    const env = { NODE_ENV: "production", SMTP_HOST: "smtp.escola.com", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "Plataforma <a@escola.com>" };
    expect(byId(await runSystemChecks({ env, ...healthy }))["email"]?.detail).toContain("SMTP configurado (smtp.escola.com)");
  });

  it("Nenhum provedor configurado em produção: mostra quais variáveis faltam", async () => {
    const { GMAIL_USER: _u, GMAIL_APP_PASSWORD: _p, EMAIL_PROVIDER: _e, ...env } = prodEnv;
    void _u; void _p; void _e;
    const c = byId(await runSystemChecks({ env, ...healthy }));
    expect(c["email"]).toMatchObject({ status: "warn" });
    expect(c["email"]?.detail).toContain("GMAIL_USER");
  });

  it.each([
    [undefined, /não definida/],
    ["meu-app.vercel.app", /inválida/],
    ['"https://meu-app.vercel.app"', /inválida/],
    ["http://meu-app.com.br", /https/],
  ])("AUTH_URL %p é sinalizada", async (authUrl, pattern) => {
    const c = byId(await runSystemChecks({ env: { ...prodEnv, AUTH_URL: authUrl }, ...healthy }));
    expect(c["auth-url"]?.status).toBe("warn");
    expect(c["auth-url"]?.detail).toMatch(pattern);
  });

  it("sem CRON_SECRET em produção avisa (a limpeza diária não roda); em desenvolvimento não", async () => {
    const { CRON_SECRET: _c, ...semCron } = prodEnv;
    void _c;
    const prod = byId(await runSystemChecks({ env: semCron, ...healthy }));
    expect(prod["cron"]?.status).toBe("warn");
    expect(prod["cron"]?.detail).toMatch(/CRON_SECRET/);
    const dev = byId(await runSystemChecks({ env: { ...semCron, NODE_ENV: "development" }, ...healthy }));
    expect(dev["cron"]?.status).toBe("ok");
  });

  it("AUTH_SECRET curto ou ausente", async () => {
    const c = byId(await runSystemChecks({ env: { ...prodEnv, AUTH_SECRET: "curto" }, ...healthy }));
    expect(c["auth-secret"]?.status).toBe("warn");
  });

  it("textos legais: avisa o que falta", async () => {
    const c = byId(await runSystemChecks({ env: { ...prodEnv, LEGAL_REVIEWED: "false", LEGAL_DPO_EMAIL: "" }, ...healthy }));
    expect(c["legal"]?.status).toBe("warn");
    expect(c["legal"]?.detail).toMatch(/versão de trabalho/);
    expect(c["legal"]?.detail).toMatch(/e-mail do encarregado/);
  });

  it("NUNCA expõe valores de segredos", async () => {
    const text = JSON.stringify(await runSystemChecks({ env: prodEnv, ...healthy }));
    expect(text).not.toContain(prodEnv.AUTH_SECRET);
    expect(text).not.toContain("abcdefghijklmnop");
    expect(text).not.toContain("dpo@escola.com.br");
  });
});
