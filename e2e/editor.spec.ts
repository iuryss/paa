import { expect, test } from "@playwright/test";
import { LOCK_STUDENT, OTHER_TEACHER, prisma, resetAndSeed, seedCompletedSessions, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { loginAdult, loginStudent, option } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test("professor cria uma atividade pelo formulário, testa, publica, atribui e o aluno joga", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades");
  await page.getByRole("link", { name: "Nova atividade" }).click();
  await page.getByRole("link", { name: /Grafia/ }).click();
  await expect(page).toHaveURL(/modulo=GRAFIA/);

  await page.getByLabel("Título").fill("Letras do C");
  await page.getByLabel("Instrução curta").fill("Ache a letra pequena");
  await page.getByLabel("Pergunta").fill("Qual é a letra c pequena?");
  await page.getByLabel("Letra mostrada (maiúscula)").fill("C");
  await expect(page.getByText("c", { exact: true }).first()).toBeVisible(); // a resposta certa é derivada
  await page.getByLabel("Opção errada 1", { exact: true }).fill("k");
  await page.getByLabel("Opção errada 2", { exact: true }).fill("g");
  await page.getByLabel(/Publicada/).check();
  await page.getByRole("radio", { name: "Só formas" }).check();

  // Pré-visualização: roda a atividade de verdade, sem gravar nada.
  await page.getByRole("button", { name: "Pré-visualizar" }).click();
  const preview = page.getByRole("region", { name: "Pré-visualização" });
  await expect(preview.getByText("Modo de teste")).toBeVisible();
  await expect(preview.getByRole("heading", { level: 1, name: "Qual é a letra c pequena?" })).toBeVisible();
  // "Só formas": a opção diz a forma, sem cor.
  await expect(preview.getByRole("button", { name: /^c, (círculo|triângulo|quadrado|estrela)$/ })).toBeVisible();
  await preview.getByRole("button", { name: /^c, / }).click();
  await expect(preview.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
  expect(await prisma.activitySession.count()).toBe(0);
  await page.getByRole("button", { name: "Fechar pré-visualização" }).click();

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/professor\/atividades\/[A-Za-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Letras do C" })).toBeVisible();

  const saved = await prisma.activity.findFirst({ where: { title: "Letras do C" } });
  expect(saved).toMatchObject({ published: true, module: "GRAFIA", authorId: seed.teacherId, markerStyle: "FORMAS" });
  const content = saved!.content as { items: { correctId: string; options: { label: string }[] }[] };
  expect(content.items[0]!.correctId).toBe("l-c");
  expect(content.items[0]!.options.map((o) => o.label).sort()).toEqual(["c", "g", "k"]);

  // Atribui ao aluno pelo relatório dele.
  await page.goto(`/professor/alunos/${seed.studentId}`);
  await page.getByLabel("Atividade", { exact: true }).selectOption({ label: "Letras do C (Grafia)" });
  await page.getByRole("button", { name: "Atribuir" }).click();
  await expect(page.getByText("Atividade atribuída.")).toBeVisible();

  // A criança vê e joga.
  const child = await browser.newContext();
  const kid = await child.newPage();
  await loginStudent(kid, STUDENT.code, STUDENT.pin);
  await kid.goto("/aluno/atividades");
  await kid.getByRole("link", { name: "Letras do C" }).click();
  await expect(kid.getByRole("heading", { level: 1, name: "Qual é a letra c pequena?" })).toBeVisible();
  await expect(kid.locator("[class*='fill-marker-']")).toHaveCount(0); // só formas, sem cor
  await option(kid, "c").click();
  await expect(kid.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
  await child.close();
});

test("o editor lista o que falta antes de salvar e não grava nada", async ({ page }) => {
  const before = await prisma.activity.count();
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades/nova?modulo=MATEMATICA");
  await page.getByRole("button", { name: "Salvar" }).click();
  const status = page.getByRole("status").filter({ hasText: "Revise antes de continuar" });
  await expect(status).toContainText("Escreva o título da atividade.");
  await expect(status).toContainText("Item 1: escreva a pergunta.");
  await expect(status).toContainText("Item 1: informe de 1 a 3 opções erradas.");
  expect(await prisma.activity.count()).toBe(before);
});

test("itens podem ser reordenados e removidos por botões (sem arrastar)", async ({ page }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades/nova?modulo=GRAFIA");
  await page.getByLabel("Pergunta").fill("Primeiro");
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Pergunta").nth(1).fill("Segundo");

  await page.getByRole("button", { name: "Subir item 2" }).click();
  await expect(page.getByLabel("Pergunta").first()).toHaveValue("Segundo");
  await page.getByRole("button", { name: "Remover item 1" }).click();
  await expect(page.getByLabel("Pergunta")).toHaveCount(1);
  await expect(page.getByLabel("Pergunta")).toHaveValue("Primeiro");
});

test("com sessões de alunos o conteúdo trava, mas dá para criar uma cópia editável", async ({ page }) => {
  await seedCompletedSessions(seed.studentId, seed.activities.grafia, 1);
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto(`/professor/atividades/${seed.activities.grafia}`);

  await expect(page.getByText("Conteúdo travado")).toBeVisible();
  await expect(page.getByLabel("Pergunta").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Adicionar item" })).toHaveCount(0);

  await page.getByRole("button", { name: "Criar cópia para editar" }).click();
  await expect(page).toHaveURL(/\/professor\/atividades\/(?!e2e-grafia)[A-Za-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cópia de Letras" })).toBeVisible();
  await expect(page.getByLabel("Pergunta").first()).toBeEnabled();
  await expect(page.getByText("Conteúdo travado")).toHaveCount(0);
});

test("outro professor não edita a atividade alheia, mas duplica a publicada", async ({ page }) => {
  await loginAdult(page, OTHER_TEACHER.email, OTHER_TEACHER.password);

  const editor = await page.goto(`/professor/atividades/${seed.activities.grafia}`);
  expect(editor?.status()).toBe(404);
  expect((await page.request.patch(`/api/professor/atividades/${seed.activities.grafia}`, { data: { title: "invadido" } })).status()).toBe(404);
  expect((await page.request.delete(`/api/professor/atividades/${seed.activities.grafia}`)).status()).toBe(404);

  await page.goto("/professor/atividades");
  await expect(page.getByRole("heading", { name: "Biblioteca da equipe" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Editar / })).toHaveCount(0); // atividades de colegas não têm "Editar"
  await page.getByRole("button", { name: "Duplicar Letras", exact: true }).click();

  await expect(page).toHaveURL(/\/professor\/atividades\/[A-Za-z0-9]+$/);
  const copy = await prisma.activity.findFirst({ where: { authorId: seed.otherTeacherId } });
  expect(copy).toMatchObject({ published: false, title: "Cópia de Letras" });
  expect((await prisma.activity.findUnique({ where: { id: seed.activities.grafia } }))?.title).toBe("Letras");
});

test("professor monta uma folha com leitura e os 3 tipos de exercício, e o aluno joga", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades/nova");
  await page.getByRole("link", { name: /Folha de exercícios/ }).click();
  await expect(page).toHaveURL(/modulo=FOLHA/);
  await expect(page.getByRole("heading", { level: 1, name: "Nova atividade de Folha de exercícios" })).toBeVisible();

  await page.getByLabel("Título").fill("O tempo");
  await page.getByLabel("Instrução curta").fill("Leia e responda");
  await page.getByLabel("Texto de leitura (opcional)").fill("De dia o **sol** brilha. À noite aparece a **lua**.");
  await page.getByLabel("Figura da leitura").selectOption({ label: "Sol" });

  // Exercício 1: escolha (já vem na folha nova)
  const ex1 = page.getByRole("group", { name: "Exercício 1" });
  await ex1.getByLabel("Enunciado").fill("O que aparece de dia?");
  await ex1.getByLabel("Texto da resposta 1").fill("Lua");
  await ex1.getByLabel("Texto da resposta 2").fill("Sol");
  await ex1.getByRole("radio", { name: "Resposta 2: esta é a certa" }).check();

  // Exercício 2: marcar todas
  await page.getByRole("group", { name: "Adicionar exercício" }).getByRole("button", { name: "Marcar todas as certas" }).click();
  const ex2 = page.getByRole("group", { name: "Exercício 2" });
  await ex2.getByLabel("Enunciado").fill("Marque o que aparece no céu");
  await ex2.getByLabel("Texto da resposta 1").fill("Sol");
  await ex2.getByLabel("Texto da resposta 2").fill("Carro");
  await ex2.getByLabel("Texto da resposta 3").fill("Nuvem");
  await ex2.getByRole("checkbox", { name: "Resposta 3: esta vale" }).check();

  // Exercício 3: verdadeiro ou falso
  await page.getByRole("group", { name: "Adicionar exercício" }).getByRole("button", { name: "Verdadeiro ou falso" }).click();
  const ex3 = page.getByRole("group", { name: "Exercício 3" });
  await ex3.getByLabel("Texto da frase 1").fill("A lua aparece à noite.");
  await ex3.getByLabel("Texto da frase 2").fill("O sol aparece à noite.");
  await ex3.getByRole("radiogroup", { name: "A frase 2 é" }).getByRole("radio", { name: "Falsa" }).check();

  await page.getByLabel(/Publicada/).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/professor\/atividades\/[A-Za-z0-9]+$/);

  const saved = await prisma.activity.findFirst({ where: { title: "O tempo" } });
  expect(saved).toMatchObject({ module: "FOLHA", published: true });
  const content = saved!.content as { support: unknown; items: Record<string, unknown>[] };
  expect(content.support).toEqual({ text: "De dia o **sol** brilha. À noite aparece a **lua**.", icon: "sol" });
  expect(content.items.map((i) => i.type)).toEqual(["escolha", "marcar", "vf"]);
  expect(content.items[1]).toMatchObject({ correctIds: ["o-sol", "o-nuvem"] });

  // Reabrindo, o formulário volta igual.
  await page.reload();
  await expect(page.getByRole("group", { name: "Exercício 1" }).getByRole("radio", { name: "Resposta 2: esta é a certa" })).toBeChecked();
  await expect(page.getByRole("group", { name: "Exercício 2" }).getByRole("checkbox", { name: "Resposta 3: esta vale" })).toBeChecked();
  await expect(page.getByLabel("Texto de leitura (opcional)")).toHaveValue("De dia o **sol** brilha. À noite aparece a **lua**.");

  await page.goto(`/professor/alunos/${seed.studentId}`);
  await page.getByLabel("Atividade", { exact: true }).selectOption({ label: "O tempo (Folha de exercícios)" });
  await page.getByRole("button", { name: "Atribuir" }).click();
  await expect(page.getByText("Atividade atribuída.")).toBeVisible();

  const child = await browser.newContext();
  const kid = await child.newPage();
  await loginStudent(kid, STUDENT.code, STUDENT.pin);
  await kid.goto("/aluno/atividades");
  await kid.getByRole("link", { name: "O tempo" }).click();
  await expect(kid.getByRole("heading", { name: "Leia" })).toBeVisible();
  await expect(kid.getByText("sol", { exact: true })).toBeVisible(); // a palavra em destaque
  await option(kid, "Sol").click();
  await expect(kid.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
  await child.close();
});

test("professor cria 'Escrever o nome' uma vez e cada aluno monta o próprio apelido", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades/nova");
  await page.getByRole("link", { name: /Escrever o nome/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Nova atividade de Escrever o nome" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Marcadores das respostas e das dicas" })).toHaveCount(0);

  await page.getByLabel("Título").fill("Meu nome em letra de forma");
  await page.getByLabel("Instrução curta").fill("Monte seu nome");
  await page.getByLabel(/Letras extras no quadro/).selectOption("1");
  await page.getByLabel(/Publicada/).check();

  await page.getByRole("button", { name: "Pré-visualizar" }).click();
  const preview = page.getByRole("region", { name: "Pré-visualização" });
  await expect(preview.getByText(/nome de exemplo “Sol”/)).toBeVisible();
  await expect(preview.getByRole("group", { name: "Letras" }).getByRole("button")).toHaveCount(4);
  await page.getByRole("button", { name: "Fechar pré-visualização" }).click();

  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/professor\/atividades\/[A-Za-z0-9]+$/);
  const saved = await prisma.activity.findFirst({ where: { title: "Meu nome em letra de forma" } });
  expect(saved).toMatchObject({ module: "NOME", published: true });

  // A mesma atividade para dois alunos: cada um vê as letras do PRÓPRIO apelido.
  for (const s of [{ id: seed.studentId, login: STUDENT, letters: "SOL" }, { id: seed.lockStudentId, login: LOCK_STUDENT, letters: "LUA" }]) {
    await prisma.assignment.create({ data: { activityId: saved!.id, studentId: s.id, assignedBy: seed.teacherId } });
    const ctx = await browser.newContext();
    const kid = await ctx.newPage();
    await loginStudent(kid, s.login.code, s.login.pin);
    await kid.goto(`/aluno/atividades/${saved!.id}`);
    const letters = await kid.getByRole("group", { name: "Letras" }).locator("[data-tile]").evaluateAll((els) => els.map((el) => el.getAttribute("data-tile")));
    expect(letters).toHaveLength(4);
    for (const c of s.letters) expect(letters).toContain(c);
    await ctx.close();
  }
});
