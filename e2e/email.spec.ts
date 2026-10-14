import { expect, test } from "@playwright/test";
import { OTHER_TEACHER, prisma, resetAndSeed, TEACHER } from "./helpers/data";
import { linkIn, mailsTo, waitForMail } from "./helpers/mailbox";
import { loginAdult } from "./helpers/ui";

test.beforeAll(async () => {
  await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test("esqueci minha senha: o e-mail chega com o link, a senha muda e o link não vale de novo", async ({ page, browser }) => {
  const since = Date.now();
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await page.getByLabel("E-mail").fill(OTHER_TEACHER.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Pedido recebido!")).toBeVisible();
  await expect(page.getByText("Se este e-mail tiver cadastro")).toBeVisible();

  const mail = await waitForMail(OTHER_TEACHER.email, "Redefinir sua senha", since);
  expect(mail.body).toContain("60 minutos");
  const link = linkIn(mail, "redefinir-senha");

  const novaSenha = "cavalo-azul-72-e2e";
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Crie uma nova senha" })).toBeVisible();
  await page.getByLabel("Nova senha", { exact: true }).fill(novaSenha);
  await page.getByLabel("Repita a senha").fill(novaSenha);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();

  await expect(page).toHaveURL(/\/entrar\?senha=ok$/);
  await expect(page.getByText("Senha alterada!")).toBeVisible();

  // A senha nova funciona; a antiga não.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password, { expectSuccess: false });
  await expect(other.getByText("Não foi possível entrar")).toBeVisible();
  await loginAdult(other, OTHER_TEACHER.email, novaSenha);
  await expect(other).toHaveURL(/\/professor$/);
  await fresh.close();

  // O mesmo link, usado de novo, não vale mais.
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Link não encontrado" })).toBeVisible();
});

test("e-mail sem cadastro recebe a MESMA resposta e nenhum e-mail é enviado", async ({ page }) => {
  const since = Date.now();
  await page.goto("/esqueci-senha");
  await page.getByLabel("E-mail").fill("ninguem@e2e.test");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Pedido recebido!")).toBeVisible();
  await expect(page.getByText("Se este e-mail tiver cadastro")).toBeVisible();

  await page.waitForTimeout(2500); // dá tempo de qualquer envio indevido acontecer
  expect(mailsTo("ninguem@e2e.test", since)).toHaveLength(0);
});

test("link de redefinição inventado mostra 'Link não encontrado'", async ({ page }) => {
  await page.goto("/redefinir-senha/" + "a".repeat(43));
  await expect(page.getByRole("heading", { level: 1, name: "Link não encontrado" })).toBeVisible();
  await page.goto("/redefinir-senha/curto");
  await expect(page.getByRole("heading", { level: 1, name: "Link não encontrado" })).toBeVisible();
});

test("professor convida um colega: o e-mail chega, a pessoa cria a conta e entra (sem alunos)", async ({ page, browser }) => {
  const since = Date.now();
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/conta");
  const invite = page.getByRole("form", { name: "Convidar professor ou terapeuta" });
  await invite.getByLabel("Nome").fill("Colega Nova");
  await invite.getByLabel("E-mail").fill("colega.nova@e2e.test");
  await invite.getByLabel("Função").selectOption("THERAPIST");
  await invite.getByRole("button", { name: "Criar convite" }).click();
  await expect(page.getByText("Convite enviado!")).toBeVisible();
  await expect(page.getByLabel("Link do convite")).toHaveValue(/\/convite\/[A-Za-z0-9_-]{43}$/);

  const mail = await waitForMail("colega.nova@e2e.test", "convidado", since);
  expect(mail.body).toContain("Professora E2E convidou você");
  const link = linkIn(mail, "convite");

  const ctx = await browser.newContext();
  const colega = await ctx.newPage();
  await colega.goto(link);
  await expect(colega.getByRole("heading", { level: 1, name: "Olá, Colega Nova!" })).toBeVisible();
  await colega.getByLabel("Crie uma senha").fill("senha-da-colega-2026");
  await colega.getByLabel("Repita a senha").fill("senha-da-colega-2026");
  await colega.getByRole("button", { name: "Criar conta" }).click();
  await expect(colega).toHaveURL(/\/entrar\?cadastro=ok$/);
  await expect(colega.getByText("Conta criada!")).toBeVisible();

  await loginAdult(colega, "colega.nova@e2e.test", "senha-da-colega-2026");
  await expect(colega).toHaveURL(/\/professor$/);
  await expect(colega.getByText("Você ainda não tem alunos")).toBeVisible(); // novo adulto não vê alunos de ninguém

  // O convite é de uso único.
  await colega.goto(link);
  await expect(colega.getByRole("heading", { level: 1, name: "Convite não encontrado" })).toBeVisible();
  await ctx.close();

  expect(await prisma.user.findUnique({ where: { email: "colega.nova@e2e.test" } })).toMatchObject({ role: "THERAPIST" });
});

test("o botão 'Enviar e-mail de teste' entrega o e-mail pelo SMTP configurado", async ({ page }) => {
  const since = Date.now();
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/conta");
  await expect(page.getByText(/SMTP configurado/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar e-mail de teste para mim" }).click();
  await expect(page.getByText("Enviado!")).toBeVisible();
  const mail = await waitForMail(TEACHER.email, "Teste de e-mail", since);
  expect(mail.body).toContain("o envio de e-mails da Plataforma TEA está funcionando");
});
