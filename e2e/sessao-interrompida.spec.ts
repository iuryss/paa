import { expect, test } from "@playwright/test";
import { CRON_SECRET, prisma, resetAndSeed, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { loginAdult, loginStudent, openActivity, option } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test("criança larga a atividade no meio: vira 'interrompida', aparece para o professor e, se ela voltar, nada se perde", async ({
  page,
  browser,
  request,
}) => {
  // 1) A criança começa e responde uma vez.
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Letras");
  await option(page, "o").click();
  await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toBeVisible();
  await expect.poll(() => prisma.attempt.count()).toBe(1);

  // 2) "Passam-se duas horas" sem ela voltar (envelhecemos a sessão no banco).
  const session = await prisma.activitySession.findFirstOrThrow({ where: { studentId: seed.studentId } });
  expect(session.status).toBe("IN_PROGRESS");
  const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const lastAnswer = new Date(startedAt.getTime() + 90_000); // jogou 90 s e parou
  await prisma.activitySession.update({ where: { id: session.id }, data: { startedAt } });
  await prisma.attempt.updateMany({ where: { sessionId: session.id }, data: { createdAt: lastAnswer } });

  // 3) A limpeza diária (cron) fecha a sessão como interrompida, com o fim na última resposta.
  const cron = await request.get("/api/cron/sessoes", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(await cron.json()).toEqual({ closed: 1 });
  const closed = await prisma.activitySession.findUniqueOrThrow({ where: { id: session.id } });
  expect(closed.status).toBe("ABANDONED");
  expect(closed.durationMs).toBe(90_000); // não infla com as 2 horas parada
  expect(closed.finishedAt?.getTime()).toBe(lastAnswer.getTime());

  // 4) O professor vê no painel e no relatório, separado dos gráficos de autonomia.
  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await loginAdult(teacher, TEACHER.email, TEACHER.password);
  await expect(teacher.getByRole("link", { name: /^Sol/ })).toContainText("1 sessão interrompida");
  await teacher.getByRole("link", { name: /^Sol/ }).click();
  const section = teacher.getByRole("region", { name: "Sessões interrompidas" });
  await expect(section).toBeVisible();
  await expect(section).toContainText("Letras");
  await expect(section).toContainText("1 min 30 s");
  await expect(section).toContainText("não entram nos gráficos de autonomia");
  await expect(teacher.getByText("Ainda não há sessões neste período.").first()).toBeVisible(); // nenhuma concluída

  // 5) A criança volta (a aba continuou aberta) e termina: a sessão é reaberta e concluída, sem perder a 1ª resposta.
  await option(page, "a").click();
  await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
  await expect.poll(async () => (await prisma.activitySession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("IN_PROGRESS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await option(page, "b").click();
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Muito bem!" })).toBeVisible();

  await expect
    .poll(async () => {
      const s = await prisma.activitySession.findUniqueOrThrow({ where: { id: session.id }, include: { attempts: true } });
      return { status: s.status, attempts: s.attempts.length, total: s.totalAttempts };
    })
    .toEqual({ status: "COMPLETED", attempts: 3, total: 3 });

  // 6) Agora entra nos gráficos e sai da lista de interrompidas.
  await teacher.reload();
  await expect(teacher.getByRole("region", { name: "Sessões interrompidas" })).toHaveCount(0);
  await expect(teacher.locator("figcaption", { hasText: "Autonomia por sessão" })).toBeVisible();
  await teacherCtx.close();
});

test("sessão com resposta recente NÃO é fechada pela limpeza (a criança ainda está jogando)", async ({ page, request }) => {
  await prisma.activitySession.deleteMany({});
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await openActivity(page, "Contas");
  await option(page, "4").click();
  await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toBeVisible();
  await expect.poll(() => prisma.attempt.count()).toBe(1);

  // Sessão começou há 3 horas, mas a última resposta foi agora.
  await prisma.activitySession.updateMany({ data: { startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
  const cron = await request.get("/api/cron/sessoes", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(await cron.json()).toEqual({ closed: 0 });
  expect((await prisma.activitySession.findFirstOrThrow()).status).toBe("IN_PROGRESS");
});
