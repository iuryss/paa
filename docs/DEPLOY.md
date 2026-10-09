# Deploy — Plataforma TEA

Dois caminhos: **container** (VPS/on-premises, controle total dos dados) ou **Vercel** + Postgres gerenciado.
Em ambos: HTTPS obrigatório, segredos fora do repositório e migrações antes de subir a nova versão.

## E-mail (redefinição de senha e convites)

A plataforma envia e-mail pelo **Resend** (`EMAIL_PROVIDER=resend`). Em produção ele é obrigatório: sem `RESEND_API_KEY` e `EMAIL_FROM` a aplicação recusa enviar.

1. Crie a conta em resend.com e **verifique o domínio** de envio (registros DNS SPF e DKIM). Sem isso os e-mails caem no spam ou são recusados.
2. Gere a chave de API e defina `RESEND_API_KEY` e `EMAIL_FROM` (`"Plataforma TEA <nao-responda@suaescola.com.br>"`).
3. Defina `AUTH_URL` com o endereço público: os links dos e-mails são montados a partir dele (nunca do cabeçalho Host).
4. Teste: peça "Esqueci minha senha" com o seu e-mail e confira a caixa de entrada **e** o spam.

Em desenvolvimento use `EMAIL_PROVIDER=console`: o e-mail aparece no terminal do servidor e nada é enviado.

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
2. Na Vercel, importe o repositório e defina as variáveis: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `LOG_LEVEL`.
3. **Build Command**: `prisma migrate deploy && npm run build`.
4. Em banco com pooler (PgBouncer), use a URL com pooler em `DATABASE_URL` e acrescente `?pgbouncer=true&connection_limit=1`. As migrações precisam de conexão direta: rode-as pelo CI ou localmente com a URL direta.
5. Em *Settings → Deployment Protection*, mantenha preview deployments protegidos: previews não devem tocar o banco de produção (use um banco separado para previews).

## Primeiro usuário (professor) em produção

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
| Bloqueio de tentativas de login | Em memória, por instância | Com mais de uma instância (ou Vercel), trocar por Redis/Upstash (`src/lib/rate-limit.ts`) |
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
