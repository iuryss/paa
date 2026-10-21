# Plataforma TEA: documento de contexto para continuar o projeto

Cole este documento no início de uma nova conversa para retomar o trabalho. Ele descreve o que é o projeto, o que já está pronto, como está construído, como foi publicado, as decisões tomadas, as limitações conhecidas e o que vem a seguir.

---

## 1. O que é

Plataforma educacional **adaptativa para crianças com Transtorno do Espectro Autista (TEA)**, usada por uma escola. Tem dois públicos:

- **Aluno (criança):** faz atividades curtas e vê só mensagens positivas. Nunca vê "erro": existe "Quase!" e "tente de novo", com dicas que aumentam aos poucos.
- **Professor / terapeuta:** acompanha a evolução de cada aluno, cria atividades e define o perfil sensorial de cada criança.

Módulos pedagógicos: **Localização espacial** (mapa N/S/L/O), **Grafia/alfabetização** (letras) e **Matemática básica** (contagem e soma).

Princípios inegociáveis:
- **LGPD:** nenhum dado pessoal da criança (sem nome completo, e-mail, CPF, foto). O aluno entra com um *código* e um *PIN*.
- **Acessibilidade WCAG 2.1 AA**, com 3 temas sensoriais.
- **Telemetria útil ao professor** (tempo, tentativas, nível de ajuda), sem expor a criança.

## 2. Stack

Next.js 15.5 (App Router, Server Actions) · React 19 · TypeScript · Tailwind 3 · estilo ShadCN + Lucide · Zod · Prisma 6 + PostgreSQL 16 · Auth.js v5 (sessão JWT, cookies HttpOnly) · Jest + Testing Library + jest-axe · Playwright + axe · nodemailer · GitHub Actions · Docker.

Design: veio de um artefato no Claude Design e foi copiado para `design/` (`tokens.json` e README). `src/styles/tokens.css` é **gerado** por `npm run tokens`. Nunca edite o CSS gerado à mão.

## 3. Funcionalidades prontas

**Aluno**
- Entrada por código + PIN (`/entrar`), com bloqueio por tentativas erradas.
- Lista de atividades, execução com feedback positivo, dicas que escalam, tela final "Muito bem!".
- Preferências próprias: tema, modo (textual ou pictográfico/PECS), fonte, movimento reduzido, som (o botão existe, mas **ainda não toca nada**).

**Professor / terapeuta**
- Entrada por e-mail + senha; convite por e-mail; "esqueci minha senha" com link de uso único.
- Painel com cartões dos alunos, relatório por aluno (autonomia, tendência, tempo, ajuda) e gráficos.
- **Sessões interrompidas** (ver 6.5): aviso no cartão e tabela no relatório.
- Editor de atividades (criar, editar, duplicar) dos 3 módulos. Qualquer profissional pode publicar; cabe ao professor do aluno decidir o que usar.
- Perfil sensorial do aluno definido pelo professor, sem mudar a tela do próprio professor.
- *Minha conta:* trocar senha e convidar colegas. (O painel técnico "Verificação do sistema" e o e-mail de teste foram **removidos** a pedido: diagnóstico agora é pelos logs da Vercel.)

**LGPD**
- Registro de consentimento, revogar (desativa o aluno e derruba a sessão na hora), reconceder, excluir de vez (com confirmação digitada), exportar JSON (sem o hash do PIN), log de auditoria sem PII.
- Páginas `/privacidade` e `/termo`, geradas de `src/content/legal.ts` e das variáveis `LEGAL_CONTROLLER_NAME`, `LEGAL_DPO_EMAIL`, `LEGAL_REVIEWED`.

## 4. Arquitetura e regras de código

```
src/app/          rotas (/entrar, /aluno, /professor, /preferencias, /api/*)
src/components/   UI base, atividades, gráficos, painel
src/lib/          regra de negócio testável (rbac, telemetry, métricas, e-mail, rate-limit…)
src/content/      textos legais
prisma/           schema, migrações, seed
e2e/              testes Playwright
scripts/          tokens, usuário inicial, servidor E2E
docs/DEPLOY.md    runbook de deploy
```

Regras que o código garante (não quebre):
- **RBAC:** `STUDENT` só em `/aluno`; `TEACHER`/`THERAPIST` só em `/professor`. Valida no middleware (`decideAccess` em `src/lib/rbac.ts`) **e** em cada API/Server Action.
- Toda entrada passa por **Zod**. Form actions usam `pickFields(formData, keys)` (`src/lib/form-data.ts`) para ignorar campos internos do React (`$ACTION_REF_*`).
- **Servidor calcula `correct`**, nunca o cliente. As opções são embaralhadas no servidor (exceto o mapa, que mantém a ordem N/S/L/O).
- **Fronteira servidor/cliente:** só dados simples e Server Actions cruzam. **Nunca importe valores de um módulo `"use client"` em arquivo de servidor** (já causou títulos vazios; use `MODULE_LABEL` de `@/lib/dashboard/metrics`).
- Sessão JWT com callback em `src/auth.ts` que revalida `isAccountActive` a cada leitura. Conta desativada perde a sessão imediatamente.
- `/entrar` redireciona usuário logado dentro da página, não no middleware (evita loop com sessão revogada).
- Prefixos públicos: `/entrar`, `/convite`, `/esqueci-senha`, `/redefinir-senha`, `/privacidade`, `/termo`, `/api/auth`, `/api/health`, `/api/cron`.
- Tokens (convite e redefinição): 32 bytes aleatórios em base64url, só o hash SHA-256 vai ao banco, uso único dentro de transação.
- Rate limit assíncrono (`src/lib/rate-limit.ts`): memória ou **Upstash Redis** via REST, chaves com hash SHA-256, com fallback para memória.
- O tema vale já na primeira pintura, via atributos no `<html>`: `data-theme` (calmo/foco/contraste), `data-mode`, `data-font`, `data-motion`.
- Este projeto usa `distDir` configurável (`NEXT_DIST_DIR`) para os testes não colidirem com o `npm run dev`.

## 5. E-mail

Provedores: `console` (só desenvolvimento), `gmail` (SMTP do Gmail com **senha de app de 16 letras**) e `smtp` genérico. **O Resend foi removido** de propósito, para não depender de domínio pago. Em produção, `console` é proibido. `describeEmailFailure` traduz erros SMTP em dicas ("use SENHA DE APP"). Não existe domínio próprio; o e-mail sai pela conta Gmail da escola.

## 6. Telemetria e métricas

1. **Autonomia** = itens resolvidos de primeira, sem ajuda ÷ itens.
2. **Tendência** compara as últimas 3 sessões com as 3 anteriores.
3. Sessão tem status `IN_PROGRESS`, `COMPLETED` ou `ABANDONED`. A duração é limitada a 2 horas.
4. Internamente, erro vira *redirecionamento* na telemetria; a criança nunca vê "erro".
5. **Sessões abandonadas:** depois de 30 min sem resposta (`STALE_AFTER_MS`), a sessão vira `ABANDONED`, com o fim na última resposta. `closeStaleSessions` roda ao abrir o painel/relatório e também no cron diário (`/api/cron/sessoes`, protegido por `CRON_SECRET` de 16+ caracteres, agendado em `vercel.json` às 06:00). Se a criança voltar e responder, a sessão **reabre** (`recordAttempt`). Sessões interrompidas ficam fora dos gráficos de autonomia.

## 7. Testes e qualidade

- **Jest:** 627 testes em 64 suítes, cobertura ≈95% (mínimo exigido 70%). Os testes de e-mail usam um servidor SMTP real (`smtp-server`) e os de Redis usam um servidor HTTP falso do Upstash.
- **Playwright:** 49 testes contra o build de **produção**, com banco separado `tea_platform_e2e`, SMTP falso e axe em ~40 estados de tela × 3 temas (WCAG A/AA e best-practice; itens "incompletos" também reprovam, exceto contraste de SVG/letras isoladas, coberto por `src/styles/tokens.test.ts`). Também confere alvos de toque ≥64 px e espaçamento ≥24 px em 375 px de largura.
- Comandos: `npm run lint`, `typecheck`, `test:ci`, `e2e` (veja o README para preparar o banco de testes).
- **CI** (`.github/workflows/main.yml`): `quality` (audit, lint, typecheck, testes, build), `docker` e `e2e`. O job `e2e` **ainda não foi confirmado verde** no GitHub.

## 8. Publicação (produção)

- **Vercel + Neon (Postgres).** URL do banco direta, com `?sslmode=require`. As migrações rodam no *Build Command* da Vercel, porque a rede do usuário bloqueia a porta 5432.
- **Upstash Redis** para o rate limit (variáveis `UPSTASH_REDIS_REST_URL/TOKEN` ou `KV_REST_API_URL/TOKEN`). O usuário confirmou que funciona.
- **Gmail** para e-mails. O usuário confirmou que funciona.
- Variáveis principais: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`/`AUTH_TRUST_HOST`, `GMAIL_*` (ou `SMTP_*`), `EMAIL_PROVIDER`, Upstash, `CRON_SECRET`, `LEGAL_*`.
- Primeiro usuário: `scripts/make-user-sql.mjs` gera o SQL para colar no Neon.
- Docker (`Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`) foi mantido como alternativa.
- Detalhes em `docs/DEPLOY.md`.

## 9. Ambiente local do usuário (Windows)

- Postgres do Docker em **localhost:5433** (a 5432 é de outro projeto).
- Pare o `npm run dev` antes de `prisma generate` ou `build` (erro EPERM no Windows).
- Exige Docker Desktop aberto para o Postgres local.

## 10. Pendências e limitações conhecidas

- **Testes com serviços reais:** Gmail e Upstash foram testados só contra servidores simulados. O usuário diz que funcionam em produção.
- `CRON_SECRET` já configurado na Vercel.
- **Textos legais** ainda estão como "Versão de trabalho" até a escola/jurista aprovar; depois, `LEGAL_REVIEWED=true`.
- **Neon está em us-east-1:** para a LGPD (transferência internacional), o ideal é migrar para São Paulo.
- O botão **"Sons" não toca nada** ainda.
- Não há UI para vincular um aluno a mais de um profissional.
- Sem política de retenção/expurgo, Sentry nem CSP.
- Atualizações grandes adiadas: Next 16, Tailwind 4, Prisma 7.
- Nenhum teste com leitor de tela real (NVDA, VoiceOver) nem tablet físico.
- Visual: pequeno aperto entre os rótulos das estatísticas do relatório.

## 11. Próxima fase (decidida pelo usuário, **ainda não iniciada**)

**Atividades dinâmicas e interativas, principalmente ARRASTAR E SOLTAR.** O usuário considera as atividades atuais simples demais ("não levam a nada"). Motivos e exemplos:
- Criança **escrever o próprio nome** arrastando letras.
- **Localizar-se arrastando lugares** num mapa.
- Outras atividades mais ricas.

Recomendações já combinadas para o desenho:
1. Antes de codar, **desenhar o modelo de atividades dinâmicas** (hoje o `Stimulus` é `map | letter | count` com opções de múltipla escolha), para que o arrastar nasça **reaproveitável** e o servidor continue calculando `correct`.
2. **Manter alternativa por toque/teclado** (tocar para escolher e tocar para soltar), por acessibilidade WCAG 2.5.1/2.1.1 e porque muitas crianças com TEA têm dificuldade motora fina.
3. Respeitar o mesmo princípio: sem "erro" visível, dicas escalonadas, telemetria de tentativas/ajuda, tema sensorial, movimento reduzido.
4. Cobrir com Playwright (incluindo teclado) e axe, como o resto.

Outros itens do "grupo 3", mantidos para depois: módulo de Ciências, fonte cursiva, pictogramas PECS reais, o som (efeitos).

## 12. Como o usuário trabalha com o Claude

- Fala português. Prefere avanço **em etapas, esperando confirmação** antes da próxima.
- Não tem equipe de TI; **tudo recai sobre ele**, então explique passos concretos e curtos.
- **Não quer gastar dinheiro** (sem domínio, sem plano pago).
- Valorizou: verificar de verdade (testes reais, navegador real), dizer o que foi e o que não foi testado, e apontar bugs encontrados.
- Contas e dados de teste: ver `prisma/seed.ts` (somente dev) e `e2e/helpers/data.ts` (apenas para o banco de testes).

## 13. Prompt sugerido para iniciar a nova conversa

> Estou continuando a **Plataforma TEA** (Next.js 15, Prisma, Auth.js, Vercel + Neon). Leia `docs/CONTEXTO-DO-PROJETO.md` e `docs/DEPLOY.md` na raiz do projeto. Tudo até as sessões abandonadas, Playwright e remoção do Resend está pronto. Quero começar a fase de **atividades interativas com arrastar e soltar** (escrever o próprio nome, arrastar lugares no mapa). Primeiro proponha o desenho do modelo de dados e da interface, com alternativa por toque e teclado, e espere minha confirmação antes de implementar.
