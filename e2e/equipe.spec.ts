import { expect, test, type Page } from "@playwright/test";
import { addStudent, OTHER_TEACHER, prisma, resetAndSeed, TEACHER, type Seeded } from "./helpers/data";
import { waitForMail } from "./helpers/mailbox";
import { loginAdult } from "./helpers/ui";

// Acompanhamento em equipe: todos os vinculados são iguais, e o aluno nunca fica sem ninguém.
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

async function fresh(name: string, code: string) {
  const student = await addStudent(seed.teacherId, name, code);
  return student.id;
}

async function otherAdult() {
  const row = await prisma.user.findUniqueOrThrow({ where: { email: OTHER_TEACHER.email } });
  return row.id;
}

const links = (studentId: string) => prisma.guidance.count({ where: { studentId } });

async function addColleague(page: Page, email: string) {
  await page.getByLabel("E-mail do colega").fill(email);
  await page.getByRole("button", { name: "Adicionar" }).click();
}

test("adiciona o colega: ele recebe o aviso sem o apelido e vê o aluno e a evolução", async ({ page, browser }) => {
  const id = await fresh("Cometa", "E2EC-0001");
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);
  await expect(page.getByText(`${TEACHER.name} (você)`)).toBeVisible();
  await expect(page.getByText("Você é a única pessoa acompanhando Cometa.")).toBeVisible();

  const since = Date.now();
  await addColleague(page, OTHER_TEACHER.email.toUpperCase());
  await expect(page.getByRole("status").filter({ hasText: "Pronto!" })).toContainText(`${OTHER_TEACHER.name} agora acompanha Cometa.`);
  await expect(page.getByRole("button", { name: `Remover ${OTHER_TEACHER.name}` })).toBeVisible();

  const mail = await waitForMail(OTHER_TEACHER.email, "Novo aluno no seu painel", since);
  expect(mail.body).toContain(`${TEACHER.name} adicionou você`);
  expect(mail.body).not.toContain("Cometa");

  const context = await browser.newContext();
  const other = await context.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password);
  await other.getByRole("link", { name: /^Cometa/ }).click();
  await expect(other.getByRole("heading", { level: 1, name: "Cometa" })).toBeVisible();
  await expect(other.locator("figcaption", { hasText: "Autonomia por sessão" })).toBeVisible();
  await context.close();

  const audit = await prisma.auditLog.findFirst({ where: { action: "student.team.add", targetId: id } });
  expect(audit?.meta).toEqual({ adultId: await otherAdult() });
});

test("o colega vê quem atribuiu cada atividade", async ({ page, browser }) => {
  const id = await fresh("Vento", "E2EC-0002");
  await prisma.guidance.create({ data: { adultId: await otherAdult(), studentId: id } });
  await prisma.assignment.create({
    data: { activityId: seed.activities.grafia, studentId: id, assignedBy: seed.teacherId },
  });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);
  const mine = page.getByRole("region", { name: "Atividades atribuídas" });
  await expect(mine.getByRole("row", { name: /Letras/ })).toContainText("Você");

  const context = await browser.newContext();
  const other = await context.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password);
  await other.goto(`/professor/alunos/${id}`);
  const theirs = other.getByRole("region", { name: "Atividades atribuídas" });
  await expect(theirs.getByRole("row", { name: /Letras/ })).toContainText(TEACHER.name);
  await context.close();
});

test("e-mail sem conta e colega repetido são recusados com explicação", async ({ page }) => {
  const id = await fresh("Rio", "E2EC-0003");
  await prisma.guidance.create({ data: { adultId: await otherAdult(), studentId: id } });
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);

  await addColleague(page, "ninguem@e2e.test");
  await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toContainText("Convide a pessoa em Minha conta");
  await addColleague(page, OTHER_TEACHER.email);
  await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toContainText("já acompanha este aluno");
  expect(await links(id)).toBe(2);
});

test("remover pede confirmação; quem sai deixa de ver o aluno na hora", async ({ page, browser }) => {
  const id = await fresh("Mar", "E2EC-0004");
  await prisma.guidance.create({ data: { adultId: await otherAdult(), studentId: id } });

  const context = await browser.newContext();
  const other = await context.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password);
  await other.goto(`/professor/alunos/${id}`);
  await expect(other.getByRole("heading", { level: 1, name: "Mar" })).toBeVisible();

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);
  await page.getByRole("button", { name: `Remover ${OTHER_TEACHER.name}` }).click();
  await page.getByRole("button", { name: "Sim, remover" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pronto!" })).toContainText("não acompanha mais Mar");
  await expect(page.getByText("Você é a única pessoa acompanhando Mar.")).toBeVisible();

  // A sessão do colega continua aberta, mas o vínculo é conferido em cada acesso.
  const response = await other.goto(`/professor/alunos/${id}`);
  expect(response?.status()).toBe(404);
  expect((await other.request.get(`/api/professor/alunos/${id}/exportar`)).status()).toBe(404);
  await context.close();
});

test("sair do acompanhamento volta ao painel e o aluno some da lista", async ({ page }) => {
  const id = await fresh("Lago", "E2EC-0005");
  await prisma.guidance.create({ data: { adultId: await otherAdult(), studentId: id } });
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);
  await page.getByRole("button", { name: "Sair do acompanhamento" }).click();
  await page.getByRole("button", { name: "Sim, sair" }).click();
  await expect(page).toHaveURL(/\/professor$/);
  await expect(page.getByRole("link", { name: /^Lago/ })).toHaveCount(0);
  expect(await links(id)).toBe(1);
});

test("servidor: quem não acompanha não adiciona nem remove, e o último adulto não sai", async ({ page, browser }) => {
  const id = await fresh("Pedra", "E2EC-0006");
  await loginAdult(page, TEACHER.email, TEACHER.password);

  const last = await page.request.delete(`/api/professor/alunos/${id}/profissionais/${seed.teacherId}`);
  expect(last.status()).toBe(409);
  expect(await links(id)).toBe(1);

  const context = await browser.newContext();
  const intruder = await context.newPage();
  await loginAdult(intruder, OTHER_TEACHER.email, OTHER_TEACHER.password);
  const add = await intruder.request.post(`/api/professor/alunos/${id}/profissionais`, {
    data: { email: OTHER_TEACHER.email },
  });
  expect(add.status()).toBe(404);
  const remove = await intruder.request.delete(`/api/professor/alunos/${id}/profissionais/${seed.teacherId}`);
  expect(remove.status()).toBe(404);
  expect(await links(id)).toBe(1);
  await context.close();
});

test("servidor: dois adultos removendo um ao outro ao mesmo tempo não deixam o aluno sem ninguém", async ({ page, browser }) => {
  const id = await fresh("Nuvem", "E2EC-0007");
  const otherId = await otherAdult();
  await prisma.guidance.create({ data: { adultId: otherId, studentId: id } });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  const context = await browser.newContext();
  const other = await context.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password);

  const [a, b] = await Promise.all([
    page.request.delete(`/api/professor/alunos/${id}/profissionais/${otherId}`),
    other.request.delete(`/api/professor/alunos/${id}/profissionais/${seed.teacherId}`),
  ]);
  expect([a.status(), b.status()].sort()).toEqual([200, 404]);
  expect(await links(id)).toBe(1);
  await context.close();
});

test("consentimento revogado: a página mostra a equipe, sem opção de adicionar", async ({ page }) => {
  const id = await fresh("Brisa", "E2EC-0008");
  await prisma.user.update({ where: { id }, data: { active: false } });
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${id}`);
  await expect(page.getByRole("heading", { name: "Quem acompanha" })).toBeVisible();
  await expect(page.getByLabel("E-mail do colega")).toHaveCount(0);
  const add = await page.request.post(`/api/professor/alunos/${id}/profissionais`, {
    data: { email: OTHER_TEACHER.email },
  });
  expect(add.status()).toBe(409);
});
