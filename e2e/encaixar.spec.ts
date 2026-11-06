import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { loginStudent, openActivity } from "./helpers/ui";

// Folha "Encaixar": lacunas "O [gelo] … O [vapor] …" (+ "fogo") e ligar Bola/Telhado/Cubo → Círculo/Triângulo/Quadrado.
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.beforeEach(async () => {
  await prisma.activitySession.deleteMany({});
});
test.afterAll(() => prisma.$disconnect());

const words = (page: Page) => page.getByRole("group", { name: "Palavras" });
const rights = (page: Page) => page.getByRole("group", { name: "Para ligar" });
const feedback = (page: Page) => page.locator('[role="status"]:not([id^="DndLiveRegion"])');
const gapStates = (page: Page) => page.locator("[data-gap]").evaluateAll((els) => els.map((el) => el.getAttribute("data-state")));
const leftStates = (page: Page) => page.locator("[data-left]").evaluateAll((els) => els.map((el) => el.getAttribute("data-state")));

async function attempts() {
  const rows = await prisma.attempt.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((a) => [a.itemKey, a.correct]);
}

/** Arrasto de verdade com o mouse, em passos, até o meio do alvo. */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  // O @dnd-kit ignora cliques por 50 ms depois de soltar (para o soltar não virar um toque).
  // Uma pessoa nunca toca tão rápido; o teste espera o mesmo antes do próximo clique.
  await page.waitForTimeout(100);
}

test("lacunas tocando e ligar arrastando: o servidor confere cada lacuna e cada par", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Encaixar");

  // Lacunas
  await expect(page.getByText("Exercício 1 de 2")).toBeVisible();
  expect(await gapStates(page)).toEqual(["atual", "vazia"]);
  await words(page).getByRole("button", { name: "fogo" }).click();
  await expect(feedback(page)).toContainText("Quase!");
  await words(page).getByRole("button", { name: "gelo" }).click();
  await expect(feedback(page)).toContainText("“gelo”");
  // A segunda palavra vai arrastada até a frase.
  await drag(page, words(page).getByRole("button", { name: "vapor" }), page.getByRole("group", { name: "Frase para completar" }));
  await expect(feedback(page)).toContainText("Você completou tudo!");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Ligar: um par diferente é "Quase!"; os certos ganham a linha.
  await expect(page.getByText("Exercício 2 de 2")).toBeVisible();
  expect(await leftStates(page)).toEqual(["atual", "esperando", "esperando"]);
  await rights(page).getByRole("button", { name: "Quadrado" }).click();
  await expect(feedback(page)).toContainText("Quase!");
  await drag(page, rights(page).getByRole("button", { name: "Círculo" }), page.getByRole("group", { name: "Itens para ligar" }));
  await expect(feedback(page)).toContainText("Bola com Círculo.");
  await expect(page.locator("svg line")).toHaveCount(1);
  await rights(page).getByRole("button", { name: "Triângulo" }).click();
  await rights(page).getByRole("button", { name: "Quadrado" }).click();
  await expect(feedback(page)).toContainText("Você ligou todos!");
  await expect(page.locator("svg line")).toHaveCount(3);
  expect(await leftStates(page)).toEqual(["ligado", "ligado", "ligado"]);

  // A linha vai mesmo do item da esquerda até o par da direita.
  const line = page.locator("svg line").first();
  const [x1, x2] = await line.evaluate((el) => [Number(el.getAttribute("x1")), Number(el.getAttribute("x2"))]);
  expect(x2).toBeGreaterThan(x1!);

  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  await expect.poll(attempts).toEqual([
    ["item-1-l1", false],
    ["item-1-l1", true],
    ["item-1-l2", true],
    ["item-2-p1", false],
    ["item-2-p1", true],
    ["item-2-p2", true],
    ["item-2-p3", true],
  ]);
  await expect
    .poll(async () => (await prisma.activitySession.findFirst({ where: { activityId: seed.activities.encaixar } }))?.status)
    .toBe("COMPLETED");
});

test("só com teclado: Tab até a palavra/par e Enter", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Encaixar");
  for (const word of ["gelo", "vapor"]) {
    await words(page).getByRole("button", { name: word }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Continuar" })).toBeFocused();
  await page.keyboard.press("Enter");
  for (const shape of ["Círculo", "Triângulo", "Quadrado"]) {
    await rights(page).getByRole("button", { name: shape }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Terminar" })).toBeFocused();
  await expect.poll(async () => (await attempts()).length).toBe(5);
});

test("dica nas lacunas: primeiro a do professor, depois a palavra em destaque", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Encaixar");
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(feedback(page)).toContainText("Leia o texto de cima.");
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(words(page).getByRole("button", { name: "gelo. Dica: esta" })).toBeVisible();
});

test.describe("celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("ligar cabe na tela (sem rolagem lateral) e o toque funciona", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Encaixar");
    await words(page).getByRole("button", { name: "gelo" }).tap();
    await words(page).getByRole("button", { name: "vapor" }).tap();
    await page.getByRole("button", { name: "Continuar" }).tap();
    await expect(rights(page).getByRole("button")).toHaveCount(3);
    for (const b of await rights(page).getByRole("button").all()) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await rights(page).getByRole("button", { name: "Círculo" }).tap();
    await expect(page.locator("svg line")).toHaveCount(1);
  });
});
