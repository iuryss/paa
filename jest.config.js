const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    "!src/app/**/layout.tsx",
    // Cola fina com Next/Auth.js (sem regra de negócio); a lógica fica em src/lib e é testada.
    "!src/auth.ts",
    "!src/middleware.ts",
    "!src/lib/db.ts",
    "!src/app/**/actions.ts",
    "!src/app/api/**",
    "!src/app/professor/**",
    "!src/app/aluno/**",
    "!src/app/entrar/page.tsx",
    "!src/app/preferencias/page.tsx",
    "!src/app/convite/**",
    "!src/app/esqueci-senha/**",
    "!src/app/redefinir-senha/**",
    "!src/app/privacidade/**",
    "!src/app/termo/**",
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 60, functions: 70, lines: 70 },
  },
};

module.exports = createJestConfig(config);
