import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Armazenamento do contador de falhas. Há duas implementações:
 *  - memória: vale por instância (ok em desenvolvimento e como reserva);
 *  - Upstash Redis: compartilhado entre TODAS as instâncias (obrigatório na Vercel/serverless,
 *    onde cada requisição pode cair numa instância diferente e a memória é descartada).
 */
export interface RateLimitStore {
  /** Soma 1 ao contador da chave (a janela começa na 1ª soma) e devolve o total. */
  increment(key: string, windowMs: number): Promise<number>;
  count(key: string): Promise<number>;
  delete(key: string): Promise<void>;
}

// ───────────────────────── Memória ─────────────────────────

export function createMemoryStore(now: () => number = Date.now): RateLimitStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    async increment(key, windowMs) {
      const entry = live(key);
      if (entry) return ++entry.count;
      entries.set(key, { count: 1, expiresAt: now() + windowMs });
      return 1;
    },
    async count(key) {
      return live(key)?.count ?? 0;
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}

// ───────────────────────── Upstash Redis (API REST) ─────────────────────────

const REDIS_TIMEOUT_MS = 2500;

type RedisReply = { result?: unknown; error?: string };

/** Fala com o Upstash por HTTPS (sem dependência extra, funciona em qualquer runtime). */
export function createUpstashStore(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): RateLimitStore {
  const base = url.replace(/\/$/, "");

  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Redis respondeu ${response.status}`);
    return response.json();
  }

  const value = (reply: RedisReply): unknown => {
    if (reply.error) throw new Error("Erro de comando no Redis");
    return reply.result;
  };

  return {
    async increment(key, windowMs) {
      // INCR + PEXPIRE NX na MESMA transação: nunca sobra uma chave sem validade (bloqueio eterno).
      const replies = (await post("/multi-exec", [
        ["INCR", key],
        ["PEXPIRE", key, String(windowMs), "NX"],
      ])) as RedisReply[];
      return Number(value(replies[0] ?? {}));
    },
    async count(key) {
      const reply = (await post("/", ["GET", key])) as RedisReply;
      return Number(value(reply) ?? 0);
    },
    async delete(key) {
      value((await post("/", ["DEL", key])) as RedisReply);
    },
  };
}

// ───────────────────────── Reserva automática ─────────────────────────

/** Se o Redis falhar, usa a memória (proteção reduzida, mas o login não cai junto). */
export function withFallback(primary: RateLimitStore, fallback: RateLimitStore): RateLimitStore {
  let lastLog = 0;
  const run = async <T>(op: (s: RateLimitStore) => Promise<T>): Promise<T> => {
    try {
      return await op(primary);
    } catch {
      if (Date.now() - lastLog > 60_000) {
        lastLog = Date.now();
        logger.error("rate_limit.redis_unavailable");
      }
      return op(fallback);
    }
  };
  return {
    increment: (k, w) => run((s) => s.increment(k, w)),
    count: (k) => run((s) => s.count(k)),
    delete: (k) => run((s) => s.delete(k)),
  };
}

// ───────────────────────── Escolha do armazenamento ─────────────────────────

export type RateLimitBackend = "redis" | "memory";

type Env = Record<string, string | undefined>;

/** Aceita as variáveis do Upstash e as do antigo Vercel KV (mesma API). */
export function redisCredentials(env: Env = process.env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function selectStore(
  env: Env = process.env,
  fetchImpl?: typeof fetch,
): { store: RateLimitStore; backend: RateLimitBackend; redis: RateLimitStore | null } {
  const memory = createMemoryStore();
  const credentials = redisCredentials(env);
  if (!credentials) {
    if (env.NODE_ENV === "production") {
      logger.warn("rate_limit.memory_in_production");
    }
    return { store: memory, backend: "memory", redis: null };
  }
  const redis = createUpstashStore(credentials.url, credentials.token, fetchImpl);
  return { store: withFallback(redis, memory), backend: "redis", redis };
}

const selected = selectStore();
export const rateLimitBackend: RateLimitBackend = selected.backend;
export const defaultStore: RateLimitStore = selected.store;

/** O Redis configurado está respondendo? (usado no painel de verificação; null = não configurado) */
export async function pingRedis(): Promise<boolean | null> {
  if (!selected.redis) return null;
  try {
    await selected.redis.count("healthcheck");
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── Limitador ─────────────────────────

export interface Limiter {
  isBlocked(key: string): Promise<boolean>;
  fail(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

/**
 * Bloqueia a chave depois de `max` falhas dentro da janela `windowMs`.
 * A chave que vai ao armazenamento é um hash (LGPD: e-mails e códigos de aluno não saem do nosso
 * sistema em texto puro para um serviço de terceiros).
 */
export function createLimiter(
  max: number,
  windowMs: number,
  store: RateLimitStore = defaultStore,
  prefix = "rl",
): Limiter {
  const storageKey = (key: string) =>
    `rl:${createHash("sha256").update(`${prefix}:${key}`).digest("hex")}`;

  return {
    isBlocked: async (key) => (await store.count(storageKey(key))) >= max,
    fail: async (key) => {
      await store.increment(storageKey(key), windowMs);
    },
    reset: async (key) => store.delete(storageKey(key)),
  };
}

/** 5 falhas em 15 minutos bloqueiam novas tentativas (PIN de 4 dígitos exige isso). */
export const loginLimiter = createLimiter(5, 15 * 60 * 1000, defaultStore, "login");
