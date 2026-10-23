import { expect, test } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, type Seeded } from "./helpers/data";
import { expectStudentHome, loginStudent, markerOf, openActivity, option } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test("aluno entra e faz a atividade de Grafia do começo ao fim, sem nunca ver a palavra 'erro'", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await expectStudentHome(page, STUDENT.name);

  await page.getByRole("link", { name: "Atividades" }).click();
  await expect(page).toHaveURL(/\/aluno\/atividades$/);
  await page.getByRole("link", { name: "Letras" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Qual é a letra a pequena?" })).toBeVisible();
  await expect(page.getByText("Passo 1 de 2")).toBeVisible();

  // Resposta diferente → convite gentil para tentar de novo.
  await option(page, "o").click();
  const feedback = page.getByRole("status").filter({ hasText: "Quase!" });
  await expect(feedback).toContainText("Vamos tentar de novo.");

  // Acerto → "Isso!" e o botão Continuar já vem com o foco.
  await option(page, "a").click();
  await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toContainText("Você achou: a.");
  const next = page.getByRole("button", { name: "Continuar" });
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Passo 2 de 2")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await option(page, "b").click();
  await page.getByRole("button", { name: "Terminar" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  // Em nenhum momento a criança viu "erro" / "errado" / contagem de tentativas.
  await expect(page.locator("body")).not.toContainText(/erro|errad|errou|falhou/i);

  // A telemetria foi gravada: 3 respostas, 1 redirecionamento, sessão concluída.
  await expect
    .poll(async () => {
      const s = await prisma.activitySession.findFirst({ where: { studentId: seed.studentId }, include: { attempts: true } });
      return s && { status: s.status, total: s.totalAttempts, redirects: s.redirects, attempts: s.attempts.length };
    })
    .toEqual({ status: "COMPLETED", total: 3, redirects: 1, attempts: 3 });
});

test("depois de duas respostas diferentes a dica aponta o marcador; na terceira, destaca", async ({ page }) => {
  await prisma.activitySession.deleteMany({});
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Letras");

  // Cada opção tem um marcador (forma + cor) desenhado na tela.
  const group = page.getByRole("group", { name: "Respostas" });
  await expect(group.locator("button svg[data-marker]")).toHaveCount(3);
  const marker = await markerOf(page, "a");

  await option(page, "o").click();
  await option(page, "e").click();
  await expect(page.getByText(`Procure ${marker}.`)).toBeVisible();
  await expect(option(page, "a")).not.toHaveAccessibleName(/Dica: esta opção/);

  await option(page, "o").click();
  await expect(page.getByText(`Toque n${marker}, que está em destaque.`)).toBeVisible();
  // A opção destacada ganha "Dica: esta opção" no nome acessível (leitor de tela).
  await expect(option(page, "a")).toHaveAccessibleName(/Dica: esta opção$/);

  await option(page, "a").click();
  await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();

  await expect
    .poll(async () => {
      const a = await prisma.attempt.findMany({ orderBy: { createdAt: "asc" } });
      return a.map((x) => [x.correct, x.helpLevel]);
    })
    .toEqual([
      [false, "NONE"],
      [false, "NONE"],
      [false, "VISUAL_HINT"],
      [true, "VISUAL_HINT"],
    ]);
});

test("o botão Dica sobe a escada: texto do professor → marcador → destaque", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Letras");
  const marker = await markerOf(page, "a");
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(page.getByText("A letra pequena parece com a grande.")).toBeVisible();
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(page.getByText(`Procure ${marker}.`)).toBeVisible();
  await page.getByRole("button", { name: "Dica" }).click();
  await expect(option(page, "a")).toHaveAccessibleName(/Dica: esta opção$/);
});

test("Localização: mapa com 'Você' no centro, ordem fixa Norte/Sul/Leste/Oeste", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Onde fica?");
  await expect(page.getByRole("img", { name: "Mapa: Escola fica ao norte de você" })).toBeVisible();
  const labels = await page.getByRole("group", { name: "Respostas" }).getByRole("button").allInnerTexts();
  expect(labels.map((l) => l.trim())).toEqual(["Norte", "Sul", "Leste", "Oeste"]);
  await option(page, "Norte").click();
  await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
});

test("Matemática: a conta aparece com as maçãs", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Contas");
  await expect(page.getByRole("img", { name: "2 maçãs mais 1 maçãs" })).toBeVisible();
  await option(page, "3").click();
  await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
});

test("Perguntas livres: apoio com figura e texto, marcadores e a resposta marcada pelo professor", async ({ page }) => {
  await prisma.activitySession.deleteMany({});
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Bichos");
  await expect(page.getByRole("heading", { level: 1, name: "Qual bicho faz au-au?" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Casa" })).toBeVisible();
  await expect(page.getByText("Na casa da Ana mora um bicho. Ele late quando alguém chega.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Respostas" }).locator("button svg[data-marker]")).toHaveCount(3);

  await option(page, "Gato").click();
  await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toBeVisible();
  await option(page, "Cachorro").click();
  await expect(page.getByRole("status").filter({ hasText: "Você achou: Cachorro." })).toBeVisible();
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  // O servidor conferiu as respostas pelo conteúdo da atividade (não pelo que o navegador disse).
  await expect
    .poll(async () => {
      const s = await prisma.activitySession.findFirst({ where: { activityId: seed.activities.livre }, include: { attempts: true } });
      return s && { status: s.status, correct: s.attempts.map((a) => a.correct) };
    })
    .toEqual({ status: "COMPLETED", correct: [false, true] });
});

test("a resposta certa não fica sempre na primeira posição", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  const firsts = new Set<string>();
  for (let i = 0; i < 14; i++) {
    await openActivity(page, "Letras");
    const first = await page.getByRole("group", { name: "Respostas" }).getByRole("button").first().innerText();
    firsts.add(first.trim());
  }
  expect(firsts.size).toBeGreaterThan(1);
});

test.describe("celular", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("alvos de toque de 64 px ou mais e espaço de 24 px entre eles (exigência do design)", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await openActivity(page, "Letras");
    const buttons = page.getByRole("group", { name: "Respostas" }).getByRole("button");
    await expect(buttons.first()).toBeVisible();
    const boxes = await buttons.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(64);
      expect(b.w).toBeGreaterThanOrEqual(64);
    }
    // Vizinhos na mesma linha: ≥ 24 px de distância horizontal.
    const row = boxes.filter((b) => Math.abs(b.y - boxes[0]!.y) < 4).sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!.x - (row[i - 1]!.x + row[i - 1]!.w)).toBeGreaterThanOrEqual(23.5);
    }
    // Sem rolagem horizontal na página.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
