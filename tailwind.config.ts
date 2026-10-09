import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

const tokenNames = [
  "page", "surface", "surface-sunken", "ink", "ink-muted", "border", "border-subtle",
  "primary", "on-primary", "primary-border", "accent", "on-accent",
  "success-bg", "success-ink", "success-border", "retry-bg", "retry-ink", "retry-border",
  "drop-bg", "drop-border", "drop-active-bg", "drop-active-border",
  "focus-ring", "disabled-bg", "disabled-ink",
];

const text = (size: string, line: string, weight: string) =>
  [size, { lineHeight: line, fontWeight: weight }] as [string, { lineHeight: string; fontWeight: string }];

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="contraste"]'],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(tokenNames.map((n) => [n, v(n)])),
        // Aliases do ShadCN UI → tokens do design system (README, "ShadCN UI").
        background: v("page"),
        foreground: v("ink"),
        card: { DEFAULT: v("surface"), foreground: v("ink") },
        muted: { DEFAULT: v("surface-sunken"), foreground: v("ink-muted") },
        input: v("border"),
        ring: v("focus-ring"),
        destructive: { DEFAULT: v("retry-border"), foreground: v("retry-ink") }, // nunca vermelho
      },
      fontFamily: {
        sans: ["var(--font-ui)", "ui-rounded", "system-ui", "sans-serif"],
        letra: ["var(--font-andika)", "var(--font-nunito)", "system-ui", "sans-serif"],
        leitura: ["var(--font-leitura)", "var(--font-nunito)", "system-ui", "sans-serif"],
      },
      fontSize: {
        display: text("48px", "56px", "800"),
        title: text("32px", "40px", "800"),
        subtitle: text("24px", "32px", "700"),
        body: text("20px", "30px", "600"),
        label: text("18px", "24px", "700"),
        button: text("22px", "28px", "800"),
        numeral: text("72px", "80px", "800"),
        "letra-bastao": text("64px", "72px", "700"),
      },
      minHeight: { target: "64px", "target-lg": "88px" },
      minWidth: { target: "64px" },
      boxShadow: { rest: v("shadow-rest"), lift: v("shadow-lift") },
    },
  },
  plugins: [],
};

export default config;
