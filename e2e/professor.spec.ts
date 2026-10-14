import { expect, test } from "@playwright/test";
import { addStudent, LOCK_STUDENT, prisma, resetAndSeed, seedCompletedSessions, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { expectStudentHome, expectTeacherHome, loginAdult, loginStudent } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
  await seedCompletedSessions(seed.studentId, seed.activities.grafia, 3);
});
test.afterAll(() => prisma.$disconnect());

test("o painel mostra o aluno com as métricas e o relatório traz os gráficos de evolução", async ({ page }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await expectTeacherHome(page);

  const card = page.getByRole("link", { name: /^Sol/ });
  await expect(card).toContainText("Sessões");
  await expect(card).toContainText("100%"); // autonomia: todos os itens de primeira e sem ajuda
  await card.click();

  await expect(page.getByRole("heading", { level: 1, name: "Sol" })).toBeVisible();
  for (const title of ["Autonomia por sessão", "Acertos nas tentativas", "Tempo médio até acertar cada item", "Nível de ajuda por sessão"]) {
    await expect(page.locator("figcaption", { hasText: title })).toBeVisible();
  }
  // Cada gráfico tem alternativa em tabela, e os pontos são acessíveis por leitor de tela.
  await expect(page.getByText("Ver como tabela").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /· Letras: 100%/ }).first()).toBeAttached();
  await expect(page.getByRole("group", { name: "Gráfico: Autonomia por sessão" })).toBeVisible();
});

test("o período do painel troca por link e fica marcado como atual", async ({ page }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.getByRole("link", { name: "7 dias" }).click();
  await expect(page).toHaveURL(/dias=7/);
  await expect(page.getByRole("link", { name: "7 dias" })).toHaveAttribute("aria-current", "page");
});

test("professor cadastra um aluno (código e PIN aparecem uma vez) e a criança consegue entrar", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.getByLabel("Apelido").fill("Estrela");
  await page.getByRole("checkbox", { name: /consentimento do responsável legal/ }).check();
  await page.getByRole("button", { name: "Cadastrar" }).click();

  const result = page.getByRole("status").filter({ hasText: "foi cadastrado" });
  await expect(result).toContainText("Estrela foi cadastrado(a)!");
  const text = await result.innerText();
  const [, code, pin] = /Código:\s*([A-Z0-9]{4}-[A-Z0-9]{4})\s*·\s*PIN:\s*(\d{4})/.exec(text) ?? [];
  expect(code).toBeTruthy();
  expect(pin).toBeTruthy();

  // Zero PII: só apelido + código + hash do PIN; e o consentimento ficou registrado.
  const created = await prisma.user.findUnique({
    where: { studentCode: code! },
    include: { consents: true, guidances: true },
  });
  expect(created?.email).toBeNull();
  expect(created?.pinHash).not.toContain(pin!);
  expect(created?.consents).toHaveLength(1);
  expect(created?.guidances).toHaveLength(1);

  const child = await browser.newContext();
  const childPage = await child.newPage();
  await loginStudent(childPage, code!, pin!);
  await expectStudentHome(childPage, "Estrela");
  await child.close();
});

test("o cadastro de aluno exige o consentimento do responsável", async ({ page }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.getByLabel("Apelido").fill("SemConsentimento");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  // O navegador bloqueia o envio: o checkbox é obrigatório.
  await expect(page.getByRole("checkbox", { name: /consentimento do responsável legal/ })).toBeFocused();
  expect(await prisma.user.count({ where: { displayName: "SemConsentimento" } })).toBe(0);
});

test("gerar novo PIN: o antigo para de valer e o novo funciona", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${seed.lockStudentId}`);
  await page.getByRole("button", { name: "Gerar novo PIN" }).click();
  await expect(page.getByText("Gerar um novo PIN para Lua?")).toBeVisible();
  await page.getByRole("button", { name: "Sim, gerar" }).click();

  const result = page.getByRole("status").filter({ hasText: "Novo PIN gerado!" });
  const [, newPin] = /PIN:\s*(\d{4})/.exec(await result.innerText()) ?? [];
  expect(newPin).toBeTruthy();
  expect(newPin).not.toBe(LOCK_STUDENT.pin);

  const child = await browser.newContext();
  const childPage = await child.newPage();
  await loginStudent(childPage, LOCK_STUDENT.code, LOCK_STUDENT.pin, { expectSuccess: false });
  await expect(childPage.getByText("Não deu certo")).toBeVisible();
  await expect(childPage).toHaveURL(/\/entrar/);
  await loginStudent(childPage, LOCK_STUDENT.code, newPin!);
  await expectStudentHome(childPage, "Lua");
  await child.close();
});

test("baixar a cópia dos dados do aluno (JSON, sem PIN)", async ({ page }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${seed.studentId}`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Baixar cópia dos dados" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^dados-sol-\d{4}-\d{2}-\d{2}\.json$/);

  const path = await download.path();
  const fs = await import("node:fs");
  const raw = fs.readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  expect(data.aluno).toMatchObject({ apelido: "Sol", codigoDeAcesso: STUDENT.code });
  expect(data.sessoes).toHaveLength(3);
  expect(data.consentimentos[0]).toMatchObject({ situacao: "GRANTED" });
  expect(raw).not.toMatch(/pinHash|passwordHash|"pin"/);
});

test("excluir definitivamente exige digitar o apelido e apaga tudo do aluno", async ({ page }) => {
  const doomed = await addStudent(seed.teacherId, "Descartável", "DEL1-0003");
  await prisma.activitySession.create({
    data: { studentId: doomed.id, activityId: seed.activities.grafia, status: "COMPLETED", totalAttempts: 1, correctCount: 1 },
  });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${doomed.id}`);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();

  const confirm = page.getByRole("button", { name: "Excluir para sempre" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, digite o apelido/).fill("Outro nome");
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, digite o apelido/).fill("descartável");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/professor$/);
  await expect(page.getByRole("link", { name: /^Descartável/ })).toHaveCount(0);
  expect(await prisma.user.count({ where: { id: doomed.id } })).toBe(0);
  expect(await prisma.activitySession.count({ where: { studentId: doomed.id } })).toBe(0);
  expect(await prisma.consentRecord.count({ where: { studentId: doomed.id } })).toBe(0);
  const audit = await prisma.auditLog.findFirst({ where: { action: "student.delete", targetId: doomed.id } });
  expect(audit).not.toBeNull();
  expect(audit?.meta).toBeNull(); // a auditoria não guarda nome nem dado algum do aluno
});
