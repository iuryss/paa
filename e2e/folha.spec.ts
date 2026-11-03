import { expect, test, type Page } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { loginStudent, openActivity, option } from "./helpers/ui";

// Folha "Matéria": leitura com destaque e exemplo; escolha, marcar todas (Pedra e Água) e V/F (V, F).
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.beforeEach(async () => {
  await prisma.activitySession.deleteMany({});
});
test.afterAll(() => prisma.$disconnect());

const feedback = (page: Page) => page.getByRole("status");
const next = (page: Page) => page.getByRole("button", { name: /^(Continuar|Terminar)$/ });

async function attempts() {
  const rows = await prisma.attempt.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((a) => [a.itemKey, a.correct]);
}

test("o aluno faz a folha inteira: leitura sempre à vista, escolha, marcar todas e V/F", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Matéria");

  // A leitura fica no topo, com a palavra em destaque e o exemplo.
  const leitura = page.getByRole("region", { name: "Leia" });
  await expect(leitura.locator("strong")).toHaveText("Matéria");
  await expect(leitura.getByText("Exemplo")).toBeVisible();
  await expect(leitura.getByRole("img", { name: "Água" })).toBeVisible();

  // 1) Escolha
  await expect(page.getByText("Exercício 1 de 3")).toBeVisible();
  await option(page, "O que ocupa espaço").click();
  await next(page).click();

  // 2) Marcar todas: cada certa soma; a que não vale é "Quase!" e não apaga as já marcadas.
  await expect(page.getByText("Exercício 2 de 3")).toBeVisible();
  await expect(leitura).toBeVisible(); // continua à vista
  await expect(page.getByText("Marque todas as certas: 0 de 2.")).toBeVisible();
  await option(page, "Pedra").click();
  await expect(feedback(page)).toContainText("Você achou: Pedra. Falta 1.");
  await expect(option(page, "Pedra")).toHaveAttribute("aria-pressed", "true");
  await option(page, "Saudade").click();
  await expect(feedback(page)).toContainText("Quase!");
  await expect(option(page, "Pedra")).toHaveAttribute("aria-pressed", "true");
  await option(page, "Água").click();
  await expect(feedback(page)).toContainText("Você achou todas!");
  await next(page).click();

  // 3) V/F: uma frase por vez, Verdadeiro sempre antes de Falso.
  await expect(page.getByText("Exercício 3 de 3 · Frase 1 de 2")).toBeVisible();
  const labels = await page.getByRole("group", { name: "Respostas" }).getByRole("button").allInnerTexts();
  expect(labels.map((l) => l.trim())).toEqual(["Verdadeiro", "Falso"]);
  await expect(page.getByText("A água ocupa espaço.")).toBeVisible();
  await option(page, "Verdadeiro").click();
  await next(page).click();
  await expect(page.getByText("Exercício 3 de 3 · Frase 2 de 2")).toBeVisible();
  await option(page, "Falso").click();
  await next(page).click();

  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/erro|errad|errou/i);

  // O servidor conferiu cada toque pelo conteúdo salvo (inclusive as frases do V/F).
  await expect.poll(attempts).toEqual([
    ["item-1", true],
    ["item-2", true],
    ["item-2", false],
    ["item-2", true],
    ["item-3-s1", true],
    ["item-3-s2", true],
  ]);
  await expect
    .poll(async () => (await prisma.activitySession.findFirst({ where: { activityId: seed.activities.materia } }))?.status)
    .toBe("COMPLETED");
});

test("marcar todas: a dica aponta a próxima certa ainda não marcada", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Matéria");
  await option(page, "O que ocupa espaço").click();
  await next(page).click();

  await option(page, "Pedra").click();
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(feedback(page)).toContainText("Matéria dá para pegar ou pesar."); // dica do professor
  await page.getByRole("button", { name: "Dica" }).click();
  await page.getByRole("button", { name: "Dica" }).click();
  // Pedra já foi marcada: o destaque vai para a Água.
  await expect(option(page, "Água")).toHaveAccessibleName(/Dica: esta opção$/);
  await expect(option(page, "Pedra")).not.toHaveAccessibleName(/Dica/);
});
