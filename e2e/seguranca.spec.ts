import { expect, test } from "@playwright/test";
import { CRON_SECRET, LOCK_STUDENT, OTHER_TEACHER, prisma, resetAndSeed, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { expectStudentHome, loginAdult, loginStudent } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

test.describe("quem não entrou", () => {
  test("áreas restritas mandam para a entrada; APIs respondem 401", async ({ page, request }) => {
    await page.goto("/professor");
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goto("/aluno/atividades");
    await expect(page).toHaveURL(/\/entrar$/);

    expect((await request.post("/api/professor/alunos", { data: {} })).status()).toBe(401);
    expect((await request.get(`/api/professor/alunos/${seed.studentId}/exportar`)).status()).toBe(401);
    expect((await request.post("/api/conta/email-teste")).status()).toBe(401);
    expect((await request.get("/api/auth/session")).ok()).toBe(true);
  });

  test("páginas públicas abrem sem login: privacidade, termo, esqueci a senha", async ({ page }) => {
    for (const path of ["/privacidade", "/termo", "/esqueci-senha", "/entrar"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
    }
  });

  test("cabeçalhos de segurança presentes e sem X-Powered-By", async ({ request }) => {
    const headers = (await request.get("/entrar")).headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("a rota de limpeza (cron) só aceita o segredo certo", async ({ request }) => {
    expect((await request.get("/api/cron/sessoes")).status()).toBe(401);
    expect((await request.get("/api/cron/sessoes", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
    const ok = await request.get("/api/cron/sessoes", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ closed: 0 });
  });
});

test.describe("papéis", () => {
  test("aluno logado não entra na área do professor nem nas APIs dela", async ({ page }) => {
    await loginStudent(page, STUDENT.code, STUDENT.pin);
    await page.goto("/professor");
    await expect(page).toHaveURL(/\/aluno$/);
    await page.goto(`/professor/alunos/${seed.studentId}`);
    await expect(page).toHaveURL(/\/aluno$/);

    expect((await page.request.post("/api/professor/alunos", { data: {} })).status()).toBe(403);
    expect((await page.request.post("/api/conta/email-teste")).status()).toBe(403);
    expect((await page.request.get(`/api/professor/alunos/${seed.studentId}/exportar`)).status()).toBe(403);
  });

  test("professor logado não entra na área do aluno", async ({ page }) => {
    await loginAdult(page, TEACHER.email, TEACHER.password);
    await page.goto("/aluno");
    await expect(page).toHaveURL(/\/professor$/);
  });

  test("outro professor (sem vínculo) não enxerga o aluno: 404, exportação e exclusão negadas", async ({ page }) => {
    await loginAdult(page, OTHER_TEACHER.email, OTHER_TEACHER.password);
    const report = await page.goto(`/professor/alunos/${seed.studentId}`);
    expect(report?.status()).toBe(404);
    expect((await page.request.get(`/api/professor/alunos/${seed.studentId}/exportar`)).status()).toBe(404);
    expect(
      (await page.request.delete(`/api/professor/alunos/${seed.studentId}`, { data: { confirm: "Sol" } })).status(),
    ).toBe(404);
    expect(await prisma.user.count({ where: { id: seed.studentId } })).toBe(1);
  });
});

test.describe("força bruta no PIN", () => {
  test("5 PINs errados bloqueiam o aluno, mesmo com o PIN certo; o professor libera gerando um novo", async ({ page, browser }) => {
    const wrongPins = ["1111", "2222", "3333", "4444", "5555"];
    for (const pin of wrongPins) {
      await loginStudent(page, LOCK_STUDENT.code, pin, { expectSuccess: false });
      await expect(page.getByText("Não deu certo")).toBeVisible();
    }

    // Agora o PIN CERTO também é recusado: está bloqueado.
    await loginStudent(page, LOCK_STUDENT.code, LOCK_STUDENT.pin, { expectSuccess: false });
    await expect(page.getByText("Não deu certo")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);

    // O professor gera um PIN novo, o que limpa o bloqueio.
    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await loginAdult(teacher, TEACHER.email, TEACHER.password);
    await teacher.goto(`/professor/alunos/${seed.lockStudentId}`);
    await teacher.getByRole("button", { name: "Gerar novo PIN" }).click();
    await teacher.getByRole("button", { name: "Sim, gerar" }).click();
    const text = await teacher.getByRole("status").filter({ hasText: "Novo PIN gerado!" }).innerText();
    const [, newPin] = /PIN:\s*(\d{4})/.exec(text) ?? [];
    await teacherCtx.close();

    await loginStudent(page, LOCK_STUDENT.code, newPin!);
    await expectStudentHome(page, LOCK_STUDENT.name);
  });

  test("o login com código inexistente também recebe a mesma mensagem neutra", async ({ page }) => {
    await loginStudent(page, "ZZZZ-9999", "0000", { expectSuccess: false });
    await expect(page.getByText("Não deu certo")).toBeVisible();
  });
});

test.describe("consentimento revogado derruba a sessão aberta (LGPD)", () => {
  test("com o aluno logado, o professor revoga: a próxima página dele volta à entrada, sem loop", async ({ browser }) => {
    const childCtx = await browser.newContext();
    const child = await childCtx.newPage();
    await loginStudent(child, STUDENT.code, STUDENT.pin);
    await child.goto("/aluno/atividades");
    await expect(child.getByRole("link", { name: "Letras" })).toBeVisible();

    const teacherCtx = await browser.newContext();
    const teacher = await teacherCtx.newPage();
    await loginAdult(teacher, TEACHER.email, TEACHER.password);
    await teacher.goto(`/professor/alunos/${seed.studentId}`);
    await teacher.getByRole("button", { name: "Revogar consentimento" }).click();
    await teacher.getByRole("button", { name: "Sim, revogar" }).click();
    await expect(teacher.getByText("Consentimento revogado", { exact: true }).first()).toBeVisible();
    // Nenhum dado de desempenho é exibido para quem foi desativado.
    await expect(teacher.getByText("Autonomia por sessão")).toHaveCount(0);

    // A criança, que ainda tinha o cookie, é mandada para a entrada (e a entrada abre: sem loop de redirecionamento).
    await child.goto("/aluno");
    await expect(child).toHaveURL(/\/entrar$/);
    await expect(child.getByLabel("Meu código")).toBeVisible();
    await child.goto("/aluno/atividades");
    await expect(child).toHaveURL(/\/entrar$/);

    // E não consegue entrar de novo enquanto estiver desativada.
    await loginStudent(child, STUDENT.code, STUDENT.pin, { expectSuccess: false });
    await expect(child.getByText("Não deu certo")).toBeVisible();

    // Painel do professor: aparece em "Acesso desativado".
    await teacher.goto("/professor");
    await expect(teacher.getByRole("heading", { name: "Acesso desativado" })).toBeVisible();

    // Novo consentimento reativa.
    await teacher.goto(`/professor/alunos/${seed.studentId}`);
    await teacher.getByRole("button", { name: "Registrar novo consentimento" }).click();
    await teacher.getByRole("checkbox", { name: /consentimento do responsável legal/ }).check();
    await teacher.getByRole("button", { name: "Registrar e reativar" }).click();
    await expect(teacher.getByText("Autonomia por sessão")).toBeVisible();

    // Com a conta ativa de novo, o cookie que ele já tinha volta a valer (a página de entrada o leva para casa).
    await child.goto("/entrar");
    await expectStudentHome(child, STUDENT.name);

    // E um aparelho novo também consegue entrar normalmente com código e PIN.
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await loginStudent(freshPage, STUDENT.code, STUDENT.pin);
    await expectStudentHome(freshPage, STUDENT.name);
    await fresh.close();

    const consents = await prisma.consentRecord.findMany({ where: { studentId: seed.studentId }, orderBy: { createdAt: "asc" } });
    expect(consents.map((c) => c.status)).toEqual(["REVOKED", "GRANTED"]);
    await childCtx.close();
    await teacherCtx.close();
  });
});
