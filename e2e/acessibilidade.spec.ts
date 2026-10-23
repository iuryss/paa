import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma, resetAndSeed, seedCompletedSessions, setTheme, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { loginAdult, loginStudent, openActivity, option } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
  await seedCompletedSessions(seed.studentId, seed.activities.grafia, 4);
});
test.afterAll(() => prisma.$disconnect());

const THEMES = ["CALMO", "FOCO", "CONTRASTE"] as const;

interface Finding {
  where: string;
  rule: string;
  impact: string;
  help: string;
  nodes: string[];
}

/** WCAG 2.0/2.1 A e AA (inclui contraste de cor, medido sobre os pixels renderizados). */
async function scan(page: Page, where: string, findings: Finding[]) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  // Itens "incompletos" (o auditor não decide sozinho) também reprovam, EXCETO contraste de texto dentro de
  // SVG/letras isoladas, uma limitação conhecida dele (esses pares são conferidos em src/styles/tokens.test.ts).
  const incomplete = result.incomplete.filter((i) => i.id !== "color-contrast");
  for (const v of [...result.violations, ...incomplete]) {
    findings.push({
      where,
      rule: v.id,
      impact: v.impact ?? "?",
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n").slice(1, 3).join(" ").trim()}`),
    });
  }
}

function report(findings: Finding[]): string {
  return findings
    .map((f) => `[${f.impact}] ${f.rule} em ${f.where}: ${f.help}\n   ${f.nodes.join("\n   ")}`)
    .join("\n");
}

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.beforeAll(async () => {
      await setTheme(seed.studentId, theme);
      await setTheme(seed.teacherId, theme);
    });

    test(`telas do aluno sem violações de acessibilidade`, async ({ page }) => {
      const findings: Finding[] = [];
      await loginStudent(page, STUDENT.code, STUDENT.pin);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());

      await scan(page, "/aluno", findings);

      await page.goto("/aluno/atividades");
      await expect(page.getByRole("link", { name: "Letras" })).toBeVisible();
      await scan(page, "/aluno/atividades", findings);

      for (const title of ["Letras", "Onde fica?", "Contas", "Bichos"]) {
        await openActivity(page, title);
        await expect(page.getByRole("group", { name: "Respostas" })).toBeVisible();
        await scan(page, `atividade "${title}"`, findings);
      }

      // Estados com feedback: redirecionamento, dica e acerto.
      await openActivity(page, "Letras");
      await option(page, "o").click();
      await expect(page.getByRole("status").filter({ hasText: "Quase!" })).toBeVisible();
      await scan(page, "Letras: após resposta diferente (Quase!)", findings);
      await option(page, "e").click();
      await expect(page.getByText(/Procure (o|a) /)).toBeVisible();
      await scan(page, "Letras: dica do marcador", findings);
      await option(page, "o").click();
      await expect(option(page, "a")).toHaveAccessibleName(/Dica: esta opção$/);
      await scan(page, "Letras: destaque da resposta", findings);
      await option(page, "a").click();
      await expect(page.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
      await scan(page, "Letras: acerto (Isso!)", findings);

      await page.goto("/preferencias");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await scan(page, "/preferencias", findings);

      for (const path of ["/privacidade", "/termo"]) {
        await page.goto(path);
        await scan(page, path, findings);
      }

      expect(findings, `\n${report(findings)}\n`).toEqual([]);
    });

    test(`telas do professor sem violações de acessibilidade`, async ({ page }) => {
      const findings: Finding[] = [];
      await loginAdult(page, TEACHER.email, TEACHER.password);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());

      const pages: [string, string][] = [
        ["/professor", "Painel do professor"],
        [`/professor/alunos/${seed.studentId}`, "Sol"],
        ["/professor/atividades", "Atividades"],
        ["/professor/atividades/nova", "Nova atividade"],
        ["/professor/atividades/nova?modulo=GRAFIA", "Nova atividade de Grafia"],
        ["/professor/atividades/nova?modulo=LOCALIZACAO", "Nova atividade de Localização"],
        ["/professor/atividades/nova?modulo=MATEMATICA", "Nova atividade de Matemática"],
        ["/professor/atividades/nova?modulo=LIVRE", "Nova atividade de Perguntas livres"],
        [`/professor/atividades/${seed.activities.livre}`, "Bichos"],
        [`/professor/atividades/${seed.activities.grafia}`, "Letras"],
        ["/professor/conta", "Minha conta"],
        ["/preferencias", "Como você prefere ver?"],
      ];
      for (const [path, heading] of pages) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await scan(page, path, findings);
      }

      expect(findings, `\n${report(findings)}\n`).toEqual([]);
    });
  });
}

test("telas públicas (sem login) sem violações", async ({ page }) => {
  const findings: Finding[] = [];
  for (const path of ["/entrar", "/esqueci-senha", "/privacidade", "/termo", "/redefinir-senha/" + "a".repeat(43), "/convite/" + "a".repeat(43)]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await scan(page, path, findings);
  }
  expect(findings, `\n${report(findings)}\n`).toEqual([]);
});

test("o auditor não está cego: ele DETECTA contraste ruim e botão sem nome quando injetamos o problema", async ({ page }) => {
  await page.goto("/entrar");
  await page.evaluate(() => {
    const p = document.createElement("p");
    p.textContent = "Texto de baixo contraste injetado";
    p.style.color = "#d4d4d4"; // ~1.4:1 sobre o fundo da página
    document.querySelector("main")?.appendChild(p);

    const b = document.createElement("button");
    b.innerHTML = "<svg width='24' height='24'></svg>"; // botão só com ícone, sem nome acessível
    document.querySelector("main")?.appendChild(b);
  });
  const findings: Finding[] = [];
  await scan(page, "/entrar (com defeitos injetados)", findings);
  const rules = findings.map((f) => f.rule);
  expect(rules).toContain("color-contrast");
  expect(rules).toContain("button-name");
});
