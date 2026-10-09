# syntax=docker/dockerfile:1.7
# Imagem de produção: build multi-estágio, saída "standalone" do Next, usuário sem privilégios.
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
# openssl: exigido pelo engine do Prisma em Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── dependências (camada em cache enquanto package*.json não mudar) ──
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci

# ── build ──
FROM deps AS builder
COPY . .
RUN npm run build

# ── migrações: roda `prisma migrate deploy` e termina (usado pelo docker-compose.prod.yml) ──
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runtime enxuto ──
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
