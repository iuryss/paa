# Plataforma TEA

Plataforma educacional adaptativa para crianças com Transtorno do Espectro Autista: localização espacial, alfabetização e matemática básica, com painel de evolução para professores e terapeutas.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 3 · Auth.js v5 · Prisma 6 · PostgreSQL 16 · Zod · Jest + Testing Library.
**Design:** `design/` (tokens e README do design system). `src/styles/tokens.css` é gerado: `npm run tokens`.

## Rodando localmente

Requisitos: Node 20+, Docker.

```bash
cp .env.example .env          # defina AUTH_SECRET (32+ caracteres)
npm install
npm run db:up                 # Postgres em localhost:5433
npx prisma migrate dev
npm run db:seed               # professor, aluno, 5 atividades e sessões de demonstração
npm run dev                   # http://localhost:3000
```

Contas de demonstração (somente desenvolvimento): veja o comentário no topo de `prisma/seed.ts`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` / `test:ci` | Jest / Jest com cobertura (mínimo 70%) |
| `npm run build` | `prisma generate` + `next build` (pare o `dev` antes no Windows) |
| `npm run tokens` | Regenera `tokens.css` a partir de `design/tokens.json` |
| `npm run db:up` / `db:down` | Sobe/derruba o Postgres do Docker |
| `npm run db:seed` | Dados de demonstração (recusa rodar em produção) |

## Testes ponta a ponta (Playwright)

Rodam num navegador real contra a versão de **produção** do app, com um banco **separado** (`tea_platform_e2e`) e um servidor de e-mail falso. Cobrem a jornada do aluno, o painel do professor, o editor, e-mails (esqueci a senha e convite), segurança/papéis, LGPD (revogar, exportar, excluir), sessões interrompidas e **acessibilidade (axe) nos 3 temas**.

```bash
docker compose up -d db
docker exec tea-platform-db psql -U tea -d postgres -c "CREATE DATABASE tea_platform_e2e"   # uma vez
DATABASE_URL="postgresql://tea:tea_dev_password@localhost:5433/tea_platform_e2e?schema=public" npm run e2e:prepare
npx playwright install chromium                                                             # uma vez
npm run e2e                  # compila e roda tudo (~3 min)
E2E_SKIP_BUILD=1 npm run e2e # reaproveita a compilação anterior
```

O servidor de testes usa a pasta `.next-e2e` e a porta 3200: não interfere no `npm run dev`.

## Estrutura

```
src/app/            rotas (/entrar, /aluno, /professor, /preferencias, /api/*)
src/components/     UI base (ShadCN-style), atividades, gráficos, painel
src/lib/            regra de negócio testável (rbac, telemetria, métricas, validação…)
prisma/             schema, migrações e seed
docs/DEPLOY.md      deploy, backup, LGPD e pendências conhecidas
```

## Regras que o código garante

- Rotas por papel: `STUDENT` só em `/aluno`; `TEACHER`/`THERAPIST` só em `/professor` (middleware **e** verificação em cada API).
- Toda entrada de API passa por Zod; textos são sanitizados.
- Criança nunca vê "erro": existe "tente de novo", com dica que escalona. Internamente isso vira *redirecionamento* na telemetria.
- Props que cruzam servidor → cliente são dados simples (nunca funções/componentes). Há teste de regressão.

Deploy: [docs/DEPLOY.md](docs/DEPLOY.md).
