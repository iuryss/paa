# Plataforma TEA: documento de contexto para continuar o projeto

Cole este documento no início de uma nova conversa para retomar o trabalho. Ele descreve o que é o projeto, o que já está pronto, como está construído, como foi publicado, as decisões tomadas, as limitações conhecidas e o que vem a seguir.

---

## 1. O que é

Plataforma educacional **adaptativa para crianças com Transtorno do Espectro Autista (TEA)**, usada por uma escola. Tem dois públicos:

- **Aluno (criança):** faz atividades curtas e vê só mensagens positivas. Nunca vê "erro": existe "Quase!" e "tente de novo", com dicas que aumentam aos poucos.
- **Professor / terapeuta:** acompanha a evolução de cada aluno, cria atividades e define o perfil sensorial de cada criança.

Módulos pedagógicos: **Localização espacial** (mapa N/S/L/O), **Grafia/alfabetização** (letras), **Matemática básica** (contagem e soma), **Folha de exercícios** (o professor escreve a leitura e os exercícios, como numa folha do caderno) e **Escrever o nome** (arrastar ou tocar nas letras do próprio apelido).

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
- **Marcadores de cor/forma** em cada resposta (círculo azul, triângulo amarelo, quadrado verde, estrela roxa, pela posição na tela). A escada de dicas é: dica escrita → "Procure o triângulo amarelo" → destaque da opção. No tema Foco, só formas. Detalhes em `design/README.md`, seção "Marcadores".
- Preferências próprias: tema, modo (textual ou pictográfico/PECS), fonte, movimento reduzido, som (o botão existe, mas **ainda não toca nada**).

**Professor / terapeuta**
- Entrada por e-mail + senha; convite por e-mail; "esqueci minha senha" com link de uso único.
- Painel com cartões dos alunos, relatório por aluno (autonomia, tendência, tempo, ajuda) e gráficos.
- **Sessões interrompidas** (ver 6.5): aviso no cartão e tabela no relatório.
- Editor de atividades (criar, editar, duplicar) dos 5 módulos (inclui **Escrever o nome**, ver seção 11). Qualquer profissional pode publicar; cabe ao professor do aluno decidir o que usar.
- **Folha de exercícios** (`FOLHA`, substituiu as "Perguntas livres" `LIVRE`, convertidas pela migração `20261028120100`): bloco de apoio no topo (leitura de até 800 caracteres com `**destaques**`, figura e exemplo resolvido), sempre à vista, e até 12 exercícios misturados: **escolha** (2–4 respostas, uma certa), **marcar todas** (2–4, várias certas, cada toque conferido na hora) e **verdadeiro ou falso** (1–6 frases, uma por vez; chave de telemetria `item-N-sK`). Cada exercício pode ter apoio próprio. As figuras vêm da lista fechada `ICON_NAMES` (35 pictogramas, sem URL externa nem upload). O servidor confere tudo pelo conteúdo salvo (`isCorrectOption`).
- Em cada atividade o professor escolhe o estilo dos marcadores (`Activity.markerStyle`: cores e formas, só formas ou só cores). O estilo pode mudar mesmo com a atividade travada por sessões.
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

## 11. Atividades interativas (em andamento)

Feito em 3 etapas, cada uma num PR:
1. **Marcadores de cor/forma e escada de dicas** (PR #1).
2. **Perguntas livres** (PR #2, hoje convertidas em Folha), com as correções de tema após o login, microtransição do movimento reduzido e confirmação de atribuição.
3. **Escrever o próprio nome** (`NOME`): a criança monta o apelido (`User.displayName`) com letras soltas.
   - Uma atividade serve para todos os alunos: o conteúdo guarda só a configuração (letras extras 0–6, maiúsculas ou como cadastrado, modelo visível ou não).
   - O servidor monta o quadro por aluno (`buildNameItem`) e confere cada letra (`checkNameAttempt`): o id da peça codifica a letra (`c65-0` = A) e a casa é `letra-N`. Qualquer peça com a letra certa vale.
   - As letras extras nunca são letras do nome (nem com acento). Espaço e hífen de nome composto são casas fixas. Com mais de 12 letras, usa o primeiro nome. Apelido sem letras mostra "Peça ao seu professor…".
   - Três jeitos de colocar, todos pela mesma função (`placeTile`): **tocar** (vai para a próxima casa), **teclado** (Tab + Enter) e **arrastar** com `@dnd-kit/core` (soltar em qualquer ponto do nome; fora dele, a letra volta e nada é gravado). Uma casa por vez, da esquerda para a direita.
   - Escada de dicas por casa: "A próxima letra é S." com o nome-modelo → peça em destaque. 2 letras diferentes chegam ao 1º degrau; 3, ao 2º.
   - A telemetria e a tela final são compartilhadas com as outras atividades (`useActivitySession` e `ActivityDone`, em `src/components/activity-session.tsx`).

4. **Folha de exercícios** (`FOLHA`), a partir da análise dos materiais adaptados de Ciências e Matemática do 9º ano: o plano é cobrir a maioria dos formatos das folhas em papel com 3 motores (selecionar, encaixar, digitar). Próximas etapas: 5) imagens do professor (guardadas no banco, com limite de tamanho e aviso de não enviar fotos de alunos); 6) completar lacunas com banco de palavras e associar/ligar pares (com a linha desenhada); 7) classificar em grupos, ordenar, nomear imagens; 8) resposta numérica e notação matemática, marcar no texto. Depois: caça-palavras e decifrar código. Fica de fora: desenhar, contornar, cruzadinha. Os materiais em papel são licenciados ("proibido compartilhamento"): a plataforma oferece os formatos e os professores digitam o próprio conteúdo, nada é importado. O modo para adolescentes (sem pictogramas infantis) ficou para depois.

Ainda não feito: **arrastar lugares no mapa** (o arrastar já nasceu reaproveitável). Outros itens do "grupo 3", mantidos para depois: módulo de Ciências, fonte cursiva, pictogramas PECS reais, o som (efeitos). Arrastar com o dedo num tablet de verdade ainda não foi testado (o e2e cobre mouse, toque simples e teclado).

## 12. Como o usuário trabalha com o Claude

- Fala português. Prefere avanço **em etapas, esperando confirmação** antes da próxima.
- Não tem equipe de TI; **tudo recai sobre ele**, então explique passos concretos e curtos.
- **Não quer gastar dinheiro** (sem domínio, sem plano pago).
- Valorizou: verificar de verdade (testes reais, navegador real), dizer o que foi e o que não foi testado, e apontar bugs encontrados.
- Contas e dados de teste: ver `prisma/seed.ts` (somente dev) e `e2e/helpers/data.ts` (apenas para o banco de testes).

## 13. Prompt sugerido para iniciar a nova conversa

> Estou continuando a **Plataforma TEA** (Next.js 15, Prisma, Auth.js, Vercel + Neon). Leia `docs/CONTEXTO-DO-PROJETO.md` e `docs/DEPLOY.md` na raiz do projeto. Tudo até as sessões abandonadas, Playwright e remoção do Resend está pronto. Quero começar a fase de **atividades interativas com arrastar e soltar** (escrever o próprio nome, arrastar lugares no mapa). Primeiro proponha o desenho do modelo de dados e da interface, com alternativa por toque e teclado, e espere minha confirmação antes de implementar.
