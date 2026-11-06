import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { loginStudent, openActivity } from "./helpers/ui";

// Folha "Organizar": ordenar letras (S-O-L), nomear (gato, sol, + "Lua") e separar (Físico/Químico).
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.beforeEach(async () => {
  await prisma.activitySession.deleteMany({});
});
test.afterAll(() => prisma.$disconnect());

const group = (page: Page, name: string) => page.getByRole("group", { name, exact: true });
const box = (page: Page, name: string) => page.getByRole("button", { name: `Caixa ${name}`, exact: true });
const feedback = (page: Page) => page.locator('[role="status"]:not([id^="DndLiveRegion"])');
const next = (page: Page) => page.getByRole("button", { name: /^(Continuar|Terminar)$/ });
const currentCard = (page: Page) => page.locator("[data-card='atual']");

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
  await page.waitForTimeout(100); // o @dnd-kit ignora cliques por 50 ms depois de soltar
}

/** A caixa certa de cada cartão (os cartões vêm misturados). */
const RIGHT_BOX: Record<string, string> = { "Gelo derretendo": "Físico", "Papel amassado": "Físico", Ferrugem: "Químico" };

test("ordenar, nomear e separar: o servidor confere cada posição, figura e cartão", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Organizar");

  // 1) Ordenar: a primeira letra errada é "Quase!"; depois arrasta uma e toca as outras.
  await expect(page.getByText("Exercício 1 de 3")).toBeVisible();
  const pieces = group(page, "Peças");
  await pieces.getByRole("button", { name: "L", exact: true }).click();
  await expect(feedback(page)).toContainText("Quase!");
  await drag(page, pieces.getByRole("button", { name: "S", exact: true }), group(page, "Ordem certa"));
  await expect(page.locator('[data-order="1"]')).toHaveAttribute("data-state", "preenchida");
  await pieces.getByRole("button", { name: "O", exact: true }).click();
  await pieces.getByRole("button", { name: "L", exact: true }).click();
  await expect(feedback(page)).toContainText("Você colocou tudo na ordem!");
  await next(page).click();

  // 2) Nomear
  await expect(page.getByText("Exercício 2 de 3")).toBeVisible();
  await expect(page.getByRole("img", { name: "Gato" })).toBeVisible();
  const words = group(page, "Palavras");
  await words.getByRole("button", { name: "Lua" }).click();
  await expect(feedback(page)).toContainText("Quase!");
  await words.getByRole("button", { name: "Gato" }).click();
  await drag(page, words.getByRole("button", { name: "Sol" }), group(page, "Figuras para nomear"));
  await expect(feedback(page)).toContainText("Você nomeou todas!");
  await next(page).click();

  // 3) Separar: um cartão arrastado até a caixa, os outros tocando na caixa.
  await expect(page.getByText("Exercício 3 de 3")).toBeVisible();
  await expect(page.getByText("Cartão 1 de 3")).toBeVisible();
  const first = (await currentCard(page).innerText()).trim();
  await drag(page, currentCard(page), box(page, RIGHT_BOX[first]!));
  await expect(page.getByText("Cartão 2 de 3")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const label = (await currentCard(page).innerText()).trim();
    await box(page, RIGHT_BOX[label]!).click();
    if (i === 0) await expect(page.getByText("Cartão 3 de 3")).toBeVisible();
  }
  await expect(feedback(page)).toContainText("Você separou todos!");
  await expect(page.getByRole("list", { name: "Guardados em Físico" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Guardados em Químico" }).getByRole("listitem")).toHaveCount(1);
  await next(page).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  await expect
    .poll(async () => (await attempts()).length)
    .toBe(10);
  const rows = await attempts();
  expect(rows.slice(0, 7)).toEqual([
    ["item-1-o1", false],
    ["item-1-o1", true],
    ["item-1-o2", true],
    ["item-1-o3", true],
    ["item-2-n1", false],
    ["item-2-n1", true],
    ["item-2-n2", true],
  ]);
  expect(rows.slice(7).every(([key, correct]) => String(key).startsWith("item-3-c") && correct)).toBe(true);
  await expect
    .poll(async () => (await prisma.activitySession.findFirst({ where: { activityId: seed.activities.organizar } }))?.status)
    .toBe("COMPLETED");
});

test("separar: cartão na caixa errada é 'Quase!' e a dica destaca a caixa certa", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Organizar");
  for (const letter of ["S", "O", "L"]) await group(page, "Peças").getByRole("button", { name: letter, exact: true }).click();
  await next(page).click();
  for (const word of ["Gato", "Sol"]) await group(page, "Palavras").getByRole("button", { name: word }).click();
  await next(page).click();

  const label = (await currentCard(page).innerText()).trim();
  const right = RIGHT_BOX[label]!;
  const wrong = right === "Físico" ? "Químico" : "Físico";
  await box(page, wrong).click();
  await expect(feedback(page)).toContainText("Quase!");
  await expect(currentCard(page)).toContainText(label); // o cartão continua
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(page.getByRole("button", { name: `Caixa ${right}. Dica: esta` })).toBeVisible();
});

test("só com teclado: Enter nas peças e nas caixas", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Organizar");
  for (const letter of ["S", "O", "L"]) {
    await group(page, "Peças").getByRole("button", { name: letter, exact: true }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(next(page)).toBeFocused();
  await page.keyboard.press("Enter");
  for (const word of ["Gato", "Sol"]) {
    await group(page, "Palavras").getByRole("button", { name: word }).focus();
    await page.keyboard.press("Enter");
  }
  await expect(next(page)).toBeFocused();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 3; i++) {
    const label = (await currentCard(page).innerText()).trim();
    await box(page, RIGHT_BOX[label]!).focus();
    await page.keyboard.press("Enter");
    if (i < 2) await expect(page.getByText(`Cartão ${i + 2} de 3`)).toBeVisible();
  }
  await expect(next(page)).toBeFocused();
});

test.describe("celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("as caixas ficam com alvos grandes, sem rolagem lateral, e o toque funciona", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Organizar");
    for (const letter of ["S", "O", "L"]) await group(page, "Peças").getByRole("button", { name: letter, exact: true }).tap();
    await next(page).tap();
    for (const word of ["Gato", "Sol"]) await group(page, "Palavras").getByRole("button", { name: word }).tap();
    await next(page).tap();
    await expect(box(page, "Físico")).toBeVisible();
    expect((await box(page, "Físico").boundingBox())!.height).toBeGreaterThanOrEqual(64);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const label = (await currentCard(page).innerText()).trim();
    await box(page, RIGHT_BOX[label]!).tap();
    await expect(page.getByText("Cartão 2 de 3")).toBeVisible();
  });
});
