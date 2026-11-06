import { expect, test, type Page } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { loginStudent, openActivity } from "./helpers/ui";

// Folha "Potências": contas 2^3 = 8 e 2^-1 = 1/2 no teclado da tela; marcar "base" e "expoente" no texto.
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.beforeEach(async () => {
  await prisma.activitySession.deleteMany({});
});
test.afterAll(() => prisma.$disconnect());

const keypad = (page: Page) => page.getByRole("group", { name: "Teclado de números" });
const key = (page: Page, name: string) => keypad(page).getByRole("button", { name, exact: true });
const ready = (page: Page) => page.getByRole("button", { name: "Pronto" });
const words = (page: Page) => page.getByRole("group", { name: "Palavras do texto" });
const next = (page: Page) => page.getByRole("button", { name: /^(Continuar|Terminar)$/ });
const feedback = (page: Page) => page.getByRole("status");

async function attempts() {
  const rows = await prisma.attempt.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((a) => [a.itemKey, a.correct]);
}

test("contas no teclado da tela (equivalente vale) e marcar no texto, conferidos no servidor", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Potências");

  // A notação aparece desenhada na leitura e na conta.
  const leitura = page.getByRole("region", { name: "Leia" });
  await expect(leitura.locator("sup")).toHaveText("3");
  await expect(page.getByText("Exercício 1 de 2 · Conta 1 de 2")).toBeVisible();

  // Primeira conta: uma resposta diferente é "Quase!" e o campo limpa.
  await key(page, "6").click();
  await ready(page).click();
  await expect(feedback(page)).toContainText("Quase!");
  await expect(page.getByLabel("Sua resposta")).toHaveValue("");
  await key(page, "8").click();
  await ready(page).click();
  await expect(feedback(page)).toContainText("A resposta é 8.");
  await next(page).click();

  // Segunda conta: a resposta é 1/2, e 0,5 também vale.
  await expect(page.getByText("Exercício 1 de 2 · Conta 2 de 2")).toBeVisible();
  await key(page, "0").click();
  await key(page, "vírgula").click();
  await key(page, "5").click();
  await ready(page).click();
  await expect(feedback(page)).toContainText("A resposta é 1/2.");
  await next(page).click();

  // Marcar no texto
  await expect(page.getByText("Toque nas palavras certas: 0 de 2.")).toBeVisible();
  await words(page).getByRole("button", { name: "caderno." }).click();
  await expect(feedback(page)).toContainText("Quase!");
  await words(page).getByRole("button", { name: "base" }).click();
  await expect(words(page).getByRole("button", { name: "base" })).toHaveAttribute("aria-pressed", "true");
  await words(page).getByRole("button", { name: "expoente" }).click();
  await expect(feedback(page)).toContainText("Você achou todas!");
  await next(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  await expect.poll(attempts).toEqual([
    ["item-1-q1", false],
    ["item-1-q1", true],
    ["item-1-q2", true],
    ["item-2", false],
    ["item-2", true],
    ["item-2", true],
  ]);
  await expect
    .poll(async () => (await prisma.activitySession.findFirst({ where: { activityId: seed.activities.potencias } }))?.status)
    .toBe("COMPLETED");
});

test("teclado físico também funciona: digita no campo e Enter confirma", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Potências");
  await page.getByLabel("Sua resposta").focus();
  await page.keyboard.type("8");
  await page.keyboard.press("Enter");
  await expect(feedback(page)).toContainText("A resposta é 8.");
  await expect(next(page)).toBeFocused();
});

test("só com teclado nas palavras e dica em destaque, sem marcadores", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Potências");
  for (const answer of ["8", "1/2"]) {
    await page.getByLabel("Sua resposta").fill(answer);
    await ready(page).click();
    await next(page).click();
  }
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(feedback(page)).toContainText("Olhe a leitura.");
  await page.getByRole("button", { name: "Dica" }).click();
  const hinted = words(page).getByRole("button", { name: "base. Dica: esta palavra" });
  await expect(hinted).toBeVisible();
  await hinted.focus();
  await page.keyboard.press("Enter");
  await expect(words(page).getByRole("button", { name: "base" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-marker]")).toHaveCount(0);
});

test.describe("celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("teclas grandes, sem rolagem lateral, e o toque funciona", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Potências");
    await expect(key(page, "8")).toBeVisible();
    for (const button of await keypad(page).getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await key(page, "8").tap();
    await ready(page).tap();
    await expect(feedback(page)).toContainText("A resposta é 8.");
  });
});
