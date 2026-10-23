import { expect, test, type Locator, type Page } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { loginStudent, openActivity } from "./helpers/ui";

// A aluna de teste se chama "Sol": a atividade monta S, O, L (+ 2 letras extras, nunca S/O/L).
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.beforeEach(async () => {
  await prisma.activitySession.deleteMany({});
});
test.afterAll(() => prisma.$disconnect());

const board = (page: Page) => page.getByRole("group", { name: "Letras" });
const tile = (page: Page, letter: string) => board(page).getByRole("button", { name: new RegExp(`^Letra ${letter}(\\.|$)`) }).first();
const slots = (page: Page) => page.locator("[data-slot]");
const feedback = (page: Page) => page.locator('[role="status"]:not([id^="DndLiveRegion"])');

async function extraLetter(page: Page): Promise<string> {
  const letters = await board(page).locator("[data-tile]").evaluateAll((els) => els.map((el) => el.getAttribute("data-tile")!));
  return letters.find((l) => !"SOL".includes(l))!;
}

async function attempts() {
  const rows = await prisma.attempt.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((a) => [a.itemKey, a.correct, a.helpLevel]);
}

/** Arrasto de verdade com o mouse, em passos (como uma pessoa), até o meio do alvo. */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("tocando nas letras a criança monta o próprio apelido; o servidor confere cada letra", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Meu nome");
  await expect(page.getByRole("heading", { level: 1, name: "Escreva seu nome" })).toBeVisible();
  await expect(slots(page)).toHaveCount(3);
  await expect(board(page).getByRole("button")).toHaveCount(5);
  await expect(page.getByText("Seu nome:")).toHaveCount(0); // sem modelo nesta atividade

  // Letra que não é do nome: volta para o quadro, convite gentil.
  await tile(page, await extraLetter(page)).click();
  await expect(feedback(page)).toContainText("Quase!");
  await expect(board(page).getByRole("button")).toHaveCount(5);

  await tile(page, "S").click();
  await expect(feedback(page)).toContainText("A letra S.");
  await expect(slots(page).nth(0)).toHaveAttribute("data-state", "preenchida");
  await tile(page, "O").click();
  await tile(page, "L").click();
  await expect(feedback(page)).toContainText("Você escreveu seu nome: SOL!");
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/erro|errad|errou/i);

  await expect.poll(attempts).toEqual([
    ["letra-1", false, "NONE"],
    ["letra-1", true, "NONE"],
    ["letra-2", true, "NONE"],
    ["letra-3", true, "NONE"],
  ]);
  await expect
    .poll(async () => (await prisma.activitySession.findFirst({ where: { activityId: seed.activities.nome } }))?.status)
    .toBe("COMPLETED");
});

test("arrastando com o mouse: soltar no nome coloca a letra; soltar fora não faz nada", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Meu nome");
  const name = page.getByRole("list", { name: "Seu nome" });

  // Solta longe do nome: a letra volta, nenhuma tentativa é gravada.
  await drag(page, tile(page, "S"), page.getByRole("heading", { level: 1 }));
  await expect(board(page).getByRole("button")).toHaveCount(5);
  await expect(slots(page).nth(0)).toHaveAttribute("data-state", "atual");

  await drag(page, tile(page, "S"), name);
  await expect(slots(page).nth(0)).toHaveAttribute("data-state", "preenchida");
  await expect(board(page).getByRole("button")).toHaveCount(4);
  await drag(page, tile(page, "O"), name);
  await drag(page, tile(page, "L"), name);
  await expect(feedback(page)).toContainText("Você escreveu seu nome: SOL!");

  // Cada arrasto virou UMA tentativa (o clique do "soltar" não conta de novo).
  await expect.poll(attempts).toEqual([
    ["letra-1", true, "NONE"],
    ["letra-2", true, "NONE"],
    ["letra-3", true, "NONE"],
  ]);
});

test("só com teclado: Tab até a letra e Enter; o foco nunca se perde", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Meu nome");
  for (const letter of ["S", "O", "L"]) {
    // Anda com Tab até a letra certa, como quem não usa mouse.
    for (let i = 0; i < 20; i++) {
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-tile"));
      if (focused === letter) break;
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("button", { name: "Terminar" })).toBeFocused();
  await expect.poll(async () => (await attempts()).length).toBe(3);
});

test("escada de dicas: diz a letra e mostra o modelo; depois destaca a peça", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Meu nome");
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(feedback(page)).toContainText("A próxima letra é S.");
  await expect(page.getByText("Seu nome:")).toBeVisible();
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(board(page).getByRole("button", { name: "Letra S. Dica: esta letra" })).toBeVisible();
  await board(page).getByRole("button", { name: "Letra S. Dica: esta letra" }).click();
  await expect.poll(attempts).toEqual([["letra-1", true, "VISUAL_HINT"]]);
});

test.describe("celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("toque funciona; letras com 88 px, 24 px entre elas e sem rolagem lateral", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Meu nome");
    await expect(board(page).getByRole("button")).toHaveCount(5); // medir só depois de tudo na tela
    const boxes = await board(page)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
    for (const b of boxes) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(88);
    const row = boxes.filter((b) => Math.abs(b.y - boxes[0]!.y) < 4).sort((a, b) => a.x - b.x);
    expect(row.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < row.length; i++) expect(row[i]!.x - (row[i - 1]!.x + row[i - 1]!.w)).toBeGreaterThanOrEqual(23.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await tile(page, "S").tap();
    await expect(slots(page).nth(0)).toHaveAttribute("data-state", "preenchida");
  });
});

test("apelido sem letras: a criança vê um pedido de ajuda, não um erro", async ({ page }) => {
  await prisma.user.update({ where: { id: seed.studentId }, data: { displayName: "123" } });
  try {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Meu nome");
    await expect(page.getByText("Peça ao seu professor para olhar esta atividade com você.")).toBeVisible();
  } finally {
    await prisma.user.update({ where: { id: seed.studentId }, data: { displayName: STUDENT.name } });
  }
});
