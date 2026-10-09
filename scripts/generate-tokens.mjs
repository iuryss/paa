// Gera src/styles/tokens.css a partir de design/tokens.json (fonte única do design system).
// Uso: npm run tokens
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const tokens = JSON.parse(readFileSync("design/tokens.json", "utf8"));
const themes = tokens.color.themes.map((t) => t.id);
const defaultTheme = themes[0];

const themed = [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])];

function themeBlock(id) {
  const selector = id === defaultTheme ? `:root,\n[data-theme="${id}"]` : `[data-theme="${id}"]`;
  const lines = themed.map((t) => `  --${t.name}: ${t.value[id] ?? t.value[defaultTheme]};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

const statics = [...tokens.spacing.tokens, ...tokens.radius.tokens, ...tokens.size.tokens]
  .map((t) => `  --${t.name}: ${t.value};`)
  .join("\n");

const css = `/* GERADO por scripts/generate-tokens.mjs a partir de design/tokens.json. NÃO edite à mão. */\n\n${themes
  .map(themeBlock)
  .join("\n\n")}\n\n:root {\n${statics}\n}\n`;

mkdirSync("src/styles", { recursive: true });
writeFileSync("src/styles/tokens.css", css);
console.log(`tokens.css gerado (${themes.length} temas, ${themed.length} tokens por tema).`);
