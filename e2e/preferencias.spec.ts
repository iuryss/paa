import { expect, test } from "@playwright/test";
import { prisma, resetAndSeed, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { expectStudentHome, loginAdult, loginStudent, openActivity } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test("o aluno troca o tema, e ele vale já na primeira pintura depois de recarregar e de entrar de novo", async ({ page, browser }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "calmo");

  await page.getByRole("link", { name: "Como eu vejo" }).click();
  await page.getByRole("radio", { name: /Alto Contraste/ }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contraste");
  await expect.poll(async () => (await prisma.sensoryProfile.findUnique({ where: { userId: seed.studentId } }))?.theme).toBe("CONTRASTE");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contraste");

  // Em outro aparelho (nova sessão), o tema vem do servidor.
  const other = await browser.newContext();
  const device = await other.newPage();
  await loginStudent(device, STUDENT.code, STUDENT.pin);
  await expect(device.locator("html")).toHaveAttribute("data-theme", "contraste");
  await other.close();
});

test("o professor define o perfil sensorial do aluno sem mudar a própria tela", async ({ page, browser }) => {
  await prisma.sensoryProfile.update({ where: { userId: seed.studentId }, data: { theme: "CALMO", contentMode: "TEXTUAL" } });

  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/alunos/${seed.studentId}`);
  const profile = page.getByRole("form", { name: "Perfil sensorial" });
  await profile.getByRole("radio", { name: /Foco Alto/ }).check({ force: true });
  await profile.getByRole("radio", { name: /PECS/ }).check({ force: true });
  await profile.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText(/O perfil de Sol foi salvo/)).toBeVisible();

  // A tela do professor continua no tema dele.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "calmo");

  const child = await browser.newContext();
  const kid = await child.newPage();
  await loginStudent(kid, STUDENT.code, STUDENT.pin);
  await expectStudentHome(kid, "Sol");
  await expect(kid.locator("html")).toHaveAttribute("data-theme", "foco");
  await expect(kid.locator("html")).toHaveAttribute("data-mode", "pictografico");

  // No modo pictográfico, as opções mostram o pictograma junto da palavra.
  await openActivity(kid, "Onde fica?");
  await expect(kid.getByTestId("pictogram-label").first()).toBeVisible();
  await child.close();
});

test("movimento reduzido: sem transições quando a preferência está ligada", async ({ page }) => {
  await loginStudent(page, STUDENT.code, STUDENT.pin);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduce");
  await openActivity(page, "Letras");
  const duration = await page
    .getByRole("group", { name: "Respostas" })
    .getByRole("button")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  // O CSS força ~0 (0.01 ms) em todo o app quando data-motion="reduce".
  expect(parseFloat(duration)).toBeLessThan(0.001);
});

test("navegação por teclado: o link 'Ir para o conteúdo' é o primeiro foco e leva ao conteúdo", async ({ page }) => {
  await page.goto("/entrar");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Ir para o conteúdo" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#conteudo$/);
});

test("o anel de foco é visível em botões e campos (nunca outline removido sem substituto)", async ({ page }) => {
  await page.goto("/entrar");
  const field = page.getByRole("form", { name: "Aluno" }).getByLabel("Meu código");
  await field.focus();
  const shadow = await field.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
});
