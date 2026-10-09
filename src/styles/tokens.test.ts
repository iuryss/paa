import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@/lib/contrast";

interface Token {
  name: string;
  value: Record<string, string>;
}

const root = process.cwd();
const design = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8")) as {
  color: { themes: { id: string }[]; tokens: Token[] };
};
const css = readFileSync(join(root, "src/styles/tokens.css"), "utf8");

const themes = design.color.themes.map((t) => t.id);
const color = (theme: string, name: string): string => {
  const token = design.color.tokens.find((t) => t.name === name);
  const value = token?.value[theme];
  if (!value) throw new Error(`Token ${name} sem valor em ${theme}`);
  return value;
};

// Pares texto/fundo do design system (README, "Contraste verificado").
const TEXT_PAIRS: [string, string][] = [
  ["ink", "page"],
  ["ink", "surface"],
  ["ink", "surface-sunken"],
  ["ink-muted", "page"],
  ["ink-muted", "surface"],
  ["on-primary", "primary"],
  ["on-accent", "accent"],
  ["success-ink", "success-bg"],
  ["retry-ink", "retry-bg"],
  ["disabled-ink", "disabled-bg"],
];

// Elementos não textuais: bordas e anel de foco precisam de 3:1.
const UI_PAIRS: [string, string][] = [
  ["border", "page"],
  ["border", "surface"],
  ["primary-border", "page"],
  ["primary-border", "surface"], // linha e marcas dos gráficos do dashboard
  ["focus-ring", "page"],
  ["focus-ring", "surface"],
  ["drop-border", "drop-bg"],
  ["retry-border", "retry-bg"],
  ["success-border", "success-bg"],
];

describe("tokens.css está em sincronia com design/tokens.json", () => {
  it("declara todos os tokens de cor em todos os temas", () => {
    for (const theme of themes) {
      const start = css.indexOf(`[data-theme="${theme}"]`);
      expect(start).toBeGreaterThanOrEqual(0);
      const block = css.slice(start, css.indexOf("}", start));
      for (const token of design.color.tokens) {
        expect(block).toContain(`--${token.name}: ${token.value[theme]};`);
      }
    }
  });

  it("usa o tema Baixo Estímulo (calmo) como padrão em :root", () => {
    expect(css).toMatch(/:root,\s*\[data-theme="calmo"\]/);
  });
});

describe.each(themes)("contraste WCAG no tema %s", (theme) => {
  const minText = theme === "contraste" ? 7 : 4.5;

  it.each(TEXT_PAIRS)(`texto %s sobre %s ≥ ${theme === "contraste" ? 7 : 4.5}:1`, (fg, bg) => {
    expect(contrastRatio(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(minText);
  });

  it.each(UI_PAIRS)("elemento %s sobre %s ≥ 3:1", (fg, bg) => {
    expect(contrastRatio(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(3);
  });
});
