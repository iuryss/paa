# Deploy — Plataforma TEA

Dois caminhos: **container** (VPS/on-premises, controle total dos dados) ou **Vercel** + Postgres gerenciado.
Em ambos: HTTPS obrigatório, segredos fora do repositório e migrações antes de subir a nova versão.

## E-mail gratuito com Gmail (sem comprar domínio)

Funciona para qualquer destinatário e não custa nada. Serve para: "esqueci minha senha" e convite de colegas.

1. **Crie uma conta Gmail só para a plataforma** (ex.: `plataforma.escola@gmail.com`). Não use a sua pessoal.
2. Nessa conta, ligue a **Verificação em duas etapas**: https://myaccount.google.com/security (pede um celular).
3. Gere uma **senha de app**: https://myaccount.google.com/apppasswords → nome "Plataforma TEA" → *Criar*. O Google mostra um código de **16 letras** (ex.: `abcd efgh ijkl mnop`). **Copie na hora: ele não aparece de novo.** Se a página "Senhas de app" não existir, a verificação em duas etapas ainda não está ligada (ou a conta é de trabalho/escola com essa opção bloqueada).
4. Na Vercel (*Settings → Environment Variables*), defina:

   | Variável | Valor |
   |---|---|
   | `EMAIL_PROVIDER` | `gmail` |
   | `GMAIL_USER` | o endereço Gmail criado |
   | `GMAIL_APP_PASSWORD` | o código de 16 letras (com ou sem espaços; **sem aspas**) |
   | `AUTH_URL` | `https://SEU-PROJETO.vercel.app` (o endereço gratuito da Vercel serve; sem barra no fim) |

   `EMAIL_FROM` é opcional (o remetente padrão é a própria conta Gmail).
5. Faça um **novo deploy** e, em *Minha conta*, clique em **Enviar e-mail de teste para mim**. Se falhar, a tela explica o motivo.

Limites e cuidados: o Gmail gratuito envia cerca de **500 e-mails por dia**, mais do que suficiente aqui. Os primeiros e-mails podem cair no **spam**: peça aos colegas para marcar "não é spam". O remetente é o próprio Gmail (as respostas chegam nele, o que é útil). Para o encarregado (DPO), `LEGAL_DPO_EMAIL` pode ser esse mesmo Gmail. Se um dia quiserem enviar com um endereço do domínio da escola, use `EMAIL_PROVIDER=smtp` com o servidor SMTP que o provedor de e-mail indicar (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`).

## (Opcional) Domínio próprio para o site

Não é necessário: o endereço gratuito `https://SEU-PROJETO.vercel.app` funciona. Se a escola quiser um endereço próprio:

1. Compre/registre o domínio e use o **painel de DNS de onde ele foi comprado** (campos: Tipo, Nome/Host, Valor, TTL).
2. Vercel → projeto → *Settings → Domains → Add* → `seudominio.com`. A Vercel mostra os registros certos para o seu projeto; copie exatamente. Aguarde "Valid Configuration" (o HTTPS é automático).
3. Atualize `AUTH_URL` para `https://seudominio.com` (sem barra no fim, sem aspas) e faça um **novo deploy**.
4. Conferir (PowerShell): `Resolve-DnsName seudominio.com`.

Problemas comuns: o campo *Nome* de muitos painéis já acrescenta o domínio sozinho; CNAME não pode ficar no domínio raiz (`@`), use `A`; a propagação leva de minutos a algumas horas. O e-mail continua pelo Gmail (ou SMTP) independentemente do domínio do site.

## Sessões interrompidas (limpeza diária)

Quando a criança larga a atividade no meio, a sessão fica "em andamento". Depois de 30 minutos sem resposta ela passa a **interrompida** e aparece para o professor (separada dos gráficos de autonomia). Isso acontece de dois jeitos: ao abrir o painel ou o relatório, e por uma **limpeza diária** (Vercel Cron, definida em `vercel.json`, todo dia às 06:00 UTC).

1. Defina `CRON_SECRET` na Vercel com 16+ caracteres (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`). A Vercel envia esse valor sozinha como `Authorization: Bearer ...` ao chamar `/api/cron/sessoes`.
2. Sem `CRON_SECRET`, a rota recusa tudo (503) e a *Verificação do sistema* mostra "atenção". O restante continua funcionando.
3. Se a criança voltar a uma sessão interrompida e responder, a sessão é reaberta sem perder nada.

## Redis (limite de tentativas de login)

O bloqueio após 5 falhas (PIN do aluno, senha do professor, troca de senha, pedidos de "esqueci a senha") precisa de um armazenamento **compartilhado**. Na Vercel cada requisição pode cair numa instância diferente, e a memória é descartada, então sem Redis o PIN de 4 dígitos fica exposto a tentativa e erro.

1. Na Vercel: **Storage → Create → Upstash (Redis)** e conecte ao projeto. A integração injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL`/`_TOKEN`): o sistema aceita as duas formas.
2. Faça um novo deploy (variáveis novas só valem em deploys novos).
3. Confirme em **Minha conta → Verificação do sistema**: "Limite de tentativas de login: ok, Redis (compartilhado entre todas as instâncias)".

Se o Redis cair, o login **não** fica fora do ar: o sistema usa a memória como reserva (proteção reduzida por instância), registra `rate_limit.redis_unavailable` no log e o painel mostra "atenção". Os identificadores (e-mail, código do aluno) vão ao Redis apenas como hash SHA-256.

## Antes de qualquer deploy (checklist)

- [ ] `npm run lint && npm run typecheck && npm run test:ci && npm run build` passam (o CI faz isso).
- [ ] `AUTH_SECRET` novo e exclusivo de produção (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- [ ] `AUTH_URL` com a URL pública `https://…`.
- [ ] E-mail configurado e testado (seção acima).
- [ ] Banco com senha forte, **sem porta pública** e com backup automático.
- [ ] **Não rodar o seed** em produção (ele recusa, mas não o execute). Crie o primeiro professor com um script próprio (ver "Primeiro usuário").
- [ ] Termo de consentimento revisado pelo jurídico/DPO e `TERMS_VERSION` em `src/lib/terms.ts` atualizada.

## A) Container (Docker Compose)

```bash
cp .env.production.example .env.production      # preencha os valores
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

O que acontece, em ordem: sobe o Postgres → `migrate` roda `prisma migrate deploy` e termina → `app` inicia.
O app escuta em `127.0.0.1:3000`; publique **somente** por um proxy HTTPS. Exemplo com Caddy (certificado automático):

```caddyfile
app.seudominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

Verificações:

```bash
curl https://app.seudominio.com.br/api/health    # {"status":"ok","db":true}
docker compose -f docker-compose.prod.yml ps     # app deve estar "healthy"
docker compose -f docker-compose.prod.yml logs -f app   # logs em JSON, uma linha por evento
```

Atualizar versão: `git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
(as migrações novas rodam sozinhas antes do app reiniciar).

Backup do banco (agende no cron e guarde **fora** do servidor):

```bash
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz
```

## B) Vercel + Postgres gerenciado

1. Crie o banco (Neon, Supabase, RDS…) em região brasileira se possível e copie a connection string.
2. Na Vercel, importe o repositório e defina as variáveis (as `POSTGRES_*` do `.env.production.example` são só do Docker Compose e **não** se aplicam aqui):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | conexão do banco externo (obrigatória) |
   | `AUTH_SECRET` | segredo novo, só de produção (obrigatória) |
   | `AUTH_URL` | `https://seu-dominio` (obrigatória: os links de e-mail são montados a partir dela) |
   | `EMAIL_PROVIDER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` | envio de e-mail (veja "E-mail gratuito com Gmail") |
   | `LEGAL_CONTROLLER_NAME`, `LEGAL_DPO_EMAIL`, `LEGAL_REVIEWED` | textos de privacidade e termo |
   | `LOG_LEVEL` | opcional |
3. **Build Command**: `prisma migrate deploy && npm run build`.
4. Em banco com pooler (PgBouncer), use a URL com pooler em `DATABASE_URL` e acrescente `?pgbouncer=true&connection_limit=1`. As migrações precisam de conexão direta: rode-as pelo CI ou localmente com a URL direta.
5. Em *Settings → Deployment Protection*, mantenha preview deployments protegidos: previews não devem tocar o banco de produção (use um banco separado para previews).

## Primeiro usuário (professor) em produção

**Use o script, que evita o erro de aspas do PowerShell** (`$` na senha vira outra senha e o login falha com `wrong_password`). Ele gera o SQL pronto e confere que o hash casa com a senha:

```powershell
$env:NEW_PASSWORD='SuaSenhaForteAqui'
node scripts/make-user-sql.mjs insert seu-email@dominio.com "Seu Nome" TEACHER   # criar
node scripts/make-user-sql.mjs update seu-email@dominio.com                      # trocar a senha
Remove-Item Env:NEW_PASSWORD
```

Cole o SQL impresso no SQL Editor do banco. Se o login falhar, o log do servidor mostra o motivo (`auth.failed` com `reason`): `user_not_found`, `wrong_password`, `inactive` ou `wrong_role`.

O método manual abaixo continua válido, mas é mais sujeito a erro:

Sem seed. Gere o hash e insira uma única vez:

```bash
node -e "require('bcryptjs').hash(process.argv[1],12).then(console.log)" 'SenhaForteAqui'
```

```sql
INSERT INTO "User" (id, role, email, "passwordHash", "displayName", active, "createdAt", "updatedAt")
VALUES ('prof_inicial', 'TEACHER', 'professor@escola.com.br', '<hash>', 'Nome de exibição', true, now(), now());
```

Depois, troque a senha e cadastre os alunos pelo painel.

## Pendências conhecidas antes de uso real com crianças

| Item | Situação | Ação recomendada |
|---|---|---|
| CSP (Content-Security-Policy) | Não configurada | Adicionar com *nonce* depois de testar; os demais cabeçalhos já estão em `next.config.ts` |
| Dependências | `npm audit` aponta itens altos em ferramentas de build (Tailwind 3, Prisma CLI) e `next` 15 | Planejar upgrade para Next 16 / Tailwind 4 / Prisma 7 em branch própria |
| Retenção de dados | Não há expurgo automático | Definir prazo com a escola e agendar limpeza de `ActivitySession`/`Attempt` antigas |

## Textos legais (obrigatório antes do uso real)

As páginas públicas `/privacidade` e `/termo` vêm de `src/content/legal.ts` e descrevem o que o sistema faz hoje.

1. Defina `LEGAL_CONTROLLER_NAME` (nome da escola/instituição) e `LEGAL_DPO_EMAIL` (contato do encarregado).
2. **O jurídico/DPO precisa ler e aprovar os textos.** Enquanto `LEGAL_REVIEWED` não for `true`, as duas páginas mostram o aviso "Versão de trabalho".
3. Se o texto mudar de substância (novos dados, novos compartilhamentos), incremente `TERMS_VERSION` em `src/lib/terms.ts`: os novos consentimentos passam a registrar a versão nova.

## LGPD em uma página

- **Dados do aluno**: apelido + código opaco + PIN (só o hash). Sem nome completo, e-mail, nascimento ou documento.
- **Base legal**: consentimento do responsável (art. 14), registrado em `ConsentRecord` com a versão do termo.
- **Acesso**: o adulto só vê alunos com vínculo (`Guidance`); todo acesso a relatório gera `AuditLog`.
- **Direitos do titular (art. 18), pelo próprio painel do professor**: baixar a cópia dos dados (JSON, sem PIN), revogar o consentimento (bloqueia o acesso na hora, inclusive de sessão aberta, e esconde os dados) e excluir definitivamente (apaga em cascata; sobra só o registro de auditoria com o id).
- **Logs**: estruturados em JSON, com e-mail, PIN, código e tokens mascarados.
- **Cookies**: apenas o de sessão (`HttpOnly`, `SameSite=Lax`, `Secure` em produção). Sem analytics nem terceiros.
- **Fontes**: servidas pelo próprio domínio (`next/font`), sem requisições ao Google no navegador da criança.
