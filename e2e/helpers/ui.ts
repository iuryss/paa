import { expect, type Page } from "@playwright/test";

interface LoginOptions {
  /** false nos testes de login que DEVEM falhar: não espera a navegação. */
  expectSuccess?: boolean;
}

async function finishLogin(page: Page, { expectSuccess = true }: LoginOptions) {
  // Sem esta espera, um `goto` logo depois cancelaria o login que ainda está em andamento.
  if (expectSuccess) await page.waitForURL(/\/(aluno|professor)$/);
}

export async function loginStudent(page: Page, code: string, pin: string, options: LoginOptions = {}) {
  await page.goto("/entrar");
  const form = page.getByRole("form", { name: "Aluno" });
  await form.getByLabel("Meu código").fill(code);
  await form.getByLabel("Meu PIN").fill(pin);
  await form.getByRole("button", { name: "Entrar" }).click();
  await finishLogin(page, options);
}

export async function loginAdult(page: Page, email: string, password: string, options: LoginOptions = {}) {
  await page.goto("/entrar");
  const form = page.getByRole("form", { name: "Professor ou terapeuta" });
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("Senha").fill(password);
  await form.getByRole("button", { name: "Entrar" }).click();
  await finishLogin(page, options);
}

export async function expectStudentHome(page: Page, name: string) {
  await expect(page).toHaveURL(/\/aluno$/);
  await expect(page.getByRole("heading", { level: 1, name: `Oi, ${name}!` })).toBeVisible();
}

export async function expectTeacherHome(page: Page) {
  await expect(page).toHaveURL(/\/professor$/);
  await expect(page.getByRole("heading", { level: 1, name: "Painel do professor" })).toBeVisible();
}

/** Abre a atividade pela lista do aluno (como a criança faria). */
export async function openActivity(page: Page, title: string) {
  await page.goto("/aluno/atividades");
  await page.getByRole("link", { name: title }).click();
}

/** O nome acessível da opção é "rótulo, marcador" (ex.: "a, triângulo amarelo"). */
export const option = (page: Page, label: string) =>
  page
    .getByRole("group", { name: "Respostas" })
    .getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, `) });

/** O marcador da opção na tela, como a dica fala dele: "o triângulo amarelo", "a estrela roxa". */
export async function markerOf(page: Page, label: string): Promise<string> {
  const name = (await option(page, label).getAttribute("aria-label")) ?? "";
  const marker = name.split(", ")[1]?.split(".")[0] ?? "";
  return `${marker.startsWith("estrela") || marker.startsWith("cor ") ? "a" : "o"} ${marker}`;
}
