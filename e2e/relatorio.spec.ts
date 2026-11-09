import { expect, test } from "@playwright/test";
import { addStudent, prisma, resetAndSeed, setTheme, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { loginAdult, loginStudent, openActivity, option } from "./helpers/ui";

// Relatório detalhado: início × agora, frequência, ajuda por semana, dificuldade, atividade e impressão.
let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

const DAY = 24 * 60 * 60 * 1000;

/** Sessão concluída: "comAjuda" = item resolvido só na 2ª tentativa, com ajuda do adulto. */
async function session(
  studentId: string,
  activityId: string,
  daysAgo: number,
  opts: { comAjuda: boolean; difficulty: "INICIAL" | "INTERMEDIARIO" | "AVANCADO" },
) {
  const startedAt = new Date(Date.now() - daysAgo * DAY);
  const attempts = opts.comAjuda
    ? [
        { itemKey: "item-1", correct: false, helpLevel: "NONE" as const, elapsedMs: 6000, attemptNo: 1 },
        { itemKey: "item-1", correct: true, helpLevel: "FULL_MODEL" as const, elapsedMs: 9000, attemptNo: 2 },
      ]
    : [{ itemKey: "item-1", correct: true, helpLevel: "NONE" as const, elapsedMs: 3000, attemptNo: 1 }];
  await prisma.activitySession.create({
    data: {
      studentId,
      activityId,
      status: "COMPLETED",
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 60_000),
      durationMs: 60_000,
      totalAttempts: attempts.length,
      correctCount: 1,
      redirects: opts.comAjuda ? 1 : 0,
      maxHelpLevel: opts.comAjuda ? "FULL_MODEL" : "NONE",
      difficultyUsed: opts.difficulty,
      attempts: { create: attempts },
    },
  });
}

test("início × agora compara as primeiras sessões (mesmo fora do período) com as mais recentes", async ({ page }) => {
  const student = await addStudent(seed.teacherId, "Aurora", "E2ER-0001");
  // Começo do uso há ~4 meses, com ajuda do adulto; agora, sem ajuda e numa dificuldade maior.
  for (const d of [120, 119, 118]) await session(student.id, seed.activities.grafia, d, { comAjuda: true, difficulty: "INICIAL" });
  for (const d of [3, 2, 1]) await session(student.id, seed.activities.matematica, d, { comAjuda: false, difficulty: "INTERMEDIARIO" });
  await prisma.activitySession.create({
    data: { studentId: student.id, activityId: seed.activities.matematica, status: "ABANDONED", startedAt: new Date(Date.now() - 2 * DAY), durationMs: 20_000, totalAttempts: 1 },
  });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${student.id}?dias=30`);

  const cmp = page.getByRole("region", { name: "Início × agora" });
  await expect(cmp).toContainText("Compara as 3 primeiras sessões concluídas");
  await expect(cmp).toContainText("Total: 6 sessões concluídas");
  await expect(cmp.getByRole("row", { name: /^Autonomia/ })).toContainText("0%100%+100 pontos (melhorou)");
  await expect(cmp.getByRole("row", { name: /ajuda do adulto/ })).toContainText("100%0%−100 pontos (melhorou)");
  await expect(cmp.getByRole("row", { name: /Tempo até acertar/ })).toContainText("(melhorou)");

  // Frequência dos últimos 30 dias: 3 concluídas e 1 interrompida.
  const freq = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Frequência nos últimos 30 dias" }) }).last();
  await expect(freq.locator("div", { hasText: "Taxa de conclusão" }).last()).toContainText("75%");
  await expect(freq.locator("div", { hasText: "Dias com uso" }).last()).toContainText("3");

  // Só o período escolhido entra nas tabelas: as sessões antigas (Inicial) não aparecem.
  const diff = page.getByRole("region", { name: "Por dificuldade" });
  await expect(diff.getByRole("row", { name: /Intermediário/ })).toContainText("3100%");
  await expect(diff.getByRole("row", { name: /Inicial/ })).toHaveCount(0);

  await expect(page.getByRole("region", { name: "Por atividade" }).getByRole("row")).toHaveCount(2); // cabeçalho + 1
  await expect(page.getByRole("region", { name: "Ajuda por semana" }).getByRole("row").nth(1)).toBeVisible();
  await expect(page.locator("figcaption", { hasText: "Sessões sem ajuda, por semana" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Últimas sessões" }).getByRole("row").nth(1)).toContainText("Intermediário");
});

test("com poucas sessões, o relatório diz quantas faltam em vez de comparar", async ({ page }) => {
  const student = await addStudent(seed.teacherId, "Bento", "E2ER-0002");
  await session(student.id, seed.activities.grafia, 2, { comAjuda: false, difficulty: "INICIAL" });
  await session(student.id, seed.activities.grafia, 1, { comAjuda: false, difficulty: "INICIAL" });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${student.id}`);
  const cmp = page.getByRole("region", { name: "Início × agora" });
  await expect(cmp).toContainText("são necessárias pelo menos 4 sessões concluídas. Até agora: 2.");
  await expect(cmp.getByRole("table")).toHaveCount(0);
});

test("versão impressa: fundo claro mesmo no Alto Contraste, data de geração e sem formulários", async ({ page }) => {
  const student = await addStudent(seed.teacherId, "Cora", "E2ER-0003");
  await session(student.id, seed.activities.grafia, 1, { comAjuda: false, difficulty: "INICIAL" });
  await setTheme(seed.teacherId, "CONTRASTE");

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${student.id}`);
  await expect(page.getByRole("button", { name: "Imprimir ou salvar em PDF" })).toBeVisible();
  await expect(page.getByText(/Relatório gerado em/)).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByText(/Relatório gerado em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir ou salvar em PDF" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Início × agora" })).toBeVisible();
  for (const hidden of ["Atribuir atividade", "Quem acompanha"]) {
    await expect(page.getByRole("heading", { name: hidden })).toBeHidden();
  }
  await expect(page.getByLabel("E-mail do colega")).toBeHidden();
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(255, 255, 255)");

  await setTheme(seed.teacherId, "CALMO");
});

test("a sessão guarda a dificuldade que a atividade tinha quando começou", async ({ page }) => {
  await prisma.activity.update({ where: { id: seed.activities.grafia }, data: { difficulty: "AVANCADO" } });
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Letras");
  await option(page, "o").click(); // a sessão começa na primeira resposta
  await expect
    .poll(async () => {
      const row = await prisma.activitySession.findFirst({
        where: { studentId: seed.studentId, activityId: seed.activities.grafia },
        orderBy: { startedAt: "desc" },
        select: { difficultyUsed: true },
      });
      return row?.difficultyUsed ?? null;
    })
    .toBe("AVANCADO");
  await prisma.activity.update({ where: { id: seed.activities.grafia }, data: { difficulty: "INICIAL" } });
});
