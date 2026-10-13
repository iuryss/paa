/** @jest-environment node */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createLimiter,
  createMemoryStore,
  createUpstashStore,
  redisCredentials,
  selectStore,
  withFallback,
  type RateLimitStore,
} from "./rate-limit";

describe("armazenamento em memória", () => {
  it("conta dentro da janela e zera depois dela", async () => {
    let t = 0;
    const store = createMemoryStore(() => t);
    expect(await store.increment("k", 1000)).toBe(1);
    expect(await store.increment("k", 1000)).toBe(2);
    expect(await store.count("k")).toBe(2);
    t = 1001;
    expect(await store.count("k")).toBe(0);
    expect(await store.increment("k", 1000)).toBe(1); // nova janela
  });

  it("delete limpa a chave", async () => {
    const store = createMemoryStore(() => 0);
    await store.increment("k", 1000);
    await store.delete("k");
    expect(await store.count("k")).toBe(0);
  });
});

describe("createLimiter", () => {
  const make = (max: number, windowMs = 1000, now = () => 0) =>
    createLimiter(max, windowMs, createMemoryStore(now), "t");

  it("bloqueia ao atingir o máximo de falhas", async () => {
    const l = make(3);
    await l.fail("k");
    await l.fail("k");
    expect(await l.isBlocked("k")).toBe(false);
    await l.fail("k");
    expect(await l.isBlocked("k")).toBe(true);
  });

  it("isola chaves e prefixos diferentes", async () => {
    const store = createMemoryStore(() => 0);
    const a = createLimiter(1, 1000, store, "login");
    const b = createLimiter(1, 1000, store, "reset");
    await a.fail("k");
    expect(await a.isBlocked("k")).toBe(true);
    expect(await a.isBlocked("outra")).toBe(false);
    expect(await b.isBlocked("k")).toBe(false); // mesmo e-mail, outro limitador
  });

  it("libera depois da janela e o reset limpa as falhas", async () => {
    let t = 0;
    const l = make(1, 1000, () => t);
    await l.fail("k");
    expect(await l.isBlocked("k")).toBe(true);
    t = 1001;
    expect(await l.isBlocked("k")).toBe(false);
    await l.fail("k");
    await l.reset("k");
    expect(await l.isBlocked("k")).toBe(false);
  });

  it("NUNCA envia o identificador em texto puro ao armazenamento (LGPD)", async () => {
    const seen: string[] = [];
    const spy: RateLimitStore = {
      increment: async (k) => (seen.push(k), 1),
      count: async (k) => (seen.push(k), 0),
      delete: async (k) => void seen.push(k),
    };
    const l = createLimiter(5, 1000, spy, "login");
    await l.fail("adult:ana@escola.com");
    await l.isBlocked("student:DEMO-2345");
    await l.reset("adult:ana@escola.com");
    for (const key of seen) {
      expect(key).toMatch(/^rl:[0-9a-f]{64}$/);
      expect(key).not.toContain("ana");
      expect(key).not.toContain("DEMO");
    }
  });
});

describe("withFallback", () => {
  const broken: RateLimitStore = {
    increment: async () => { throw new Error("fora do ar"); },
    count: async () => { throw new Error("fora do ar"); },
    delete: async () => { throw new Error("fora do ar"); },
  };

  it("se o Redis falhar, usa a memória em vez de derrubar o login", async () => {
    const store = withFallback(broken, createMemoryStore(() => 0));
    const l = createLimiter(2, 1000, store, "t");
    await l.fail("k");
    await l.fail("k");
    expect(await l.isBlocked("k")).toBe(true); // continua protegendo (por instância)
  });

  it("com o Redis saudável, não toca na reserva", async () => {
    const fallback = createMemoryStore(() => 0);
    const spy = jest.spyOn(fallback, "increment");
    const primary = createMemoryStore(() => 0);
    await withFallback(primary, fallback).increment("k", 1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("redisCredentials / selectStore", () => {
  it("aceita as variáveis do Upstash e as do Vercel KV", () => {
    expect(redisCredentials({ UPSTASH_REDIS_REST_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "https://a", token: "t" });
    expect(redisCredentials({ KV_REST_API_URL: "https://b", KV_REST_API_TOKEN: "u" })).toEqual({ url: "https://b", token: "u" });
    expect(redisCredentials({ UPSTASH_REDIS_REST_URL: "https://a" })).toBeNull(); // falta o token
    expect(redisCredentials({})).toBeNull();
  });

  it("sem Redis configurado usa memória; com Redis, usa Redis", () => {
    expect(selectStore({ NODE_ENV: "development" }).backend).toBe("memory");
    expect(selectStore({ UPSTASH_REDIS_REST_URL: "https://a", UPSTASH_REDIS_REST_TOKEN: "t" }).backend).toBe("redis");
  });
});

describe("Upstash (com fetch simulado)", () => {
  it("INCR + PEXPIRE NX vão juntos numa transação, com o token no cabeçalho", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [{ result: 3 }, { result: 1 }] });
    const store = createUpstashStore("https://x.upstash.io/", "segredo", fetchImpl as unknown as typeof fetch);

    await expect(store.increment("rl:abc", 900000)).resolves.toBe(3);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://x.upstash.io/multi-exec");
    expect(init.headers.Authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body)).toEqual([["INCR", "rl:abc"], ["PEXPIRE", "rl:abc", "900000", "NX"]]);
  });

  it("erro HTTP ou de comando vira exceção (e o fallback assume)", async () => {
    const http = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(createUpstashStore("https://x", "t", http as unknown as typeof fetch).count("k")).rejects.toThrow("401");

    const cmd = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: "ERR" }) });
    await expect(createUpstashStore("https://x", "t", cmd as unknown as typeof fetch).count("k")).rejects.toThrow();
  });

  it("o erro não vaza o token", async () => {
    const http = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const error = await createUpstashStore("https://x", "TOKEN-SECRETO", http as unknown as typeof fetch).count("k").catch((e: Error) => e);
    expect((error as Error).message).not.toContain("TOKEN-SECRETO");
  });
});

// ─────────── Servidor HTTP falso que fala o protocolo REST do Upstash ───────────

describe("Upstash contra um servidor HTTP de verdade (integração)", () => {
  let server: Server;
  let url: string;
  const data = new Map<string, { value: number; expiresAt: number | null }>();
  const TOKEN = "token-de-teste";

  const exec = (cmd: string[]): unknown => {
    const [name, key = "", a, b] = cmd;
    const now = Date.now();
    const entry = data.get(key);
    if (entry?.expiresAt && entry.expiresAt <= now) data.delete(key);
    switch (name) {
      case "INCR": {
        const cur = data.get(key) ?? { value: 0, expiresAt: null };
        cur.value += 1;
        data.set(key, cur);
        return cur.value;
      }
      case "PEXPIRE": {
        const cur = data.get(key);
        if (!cur || (b === "NX" && cur.expiresAt !== null)) return 0;
        cur.expiresAt = now + Number(a);
        return 1;
      }
      case "GET":
        return data.has(key) ? String(data.get(key)!.value) : null;
      case "DEL":
        return data.delete(key) ? 1 : 0;
      default:
        throw new Error("comando não suportado");
    }
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) {
          res.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        const payload = JSON.parse(body);
        const reply = req.url === "/multi-exec" ? (payload as string[][]).map((c) => ({ result: exec(c) })) : { result: exec(payload) };
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(reply));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    data.clear();
  });

  it("o limitador funciona de ponta a ponta e o estado vive no servidor (não na instância)", async () => {
    const instanciaA = createLimiter(5, 900000, createUpstashStore(url, TOKEN), "login");
    const instanciaB = createLimiter(5, 900000, createUpstashStore(url, TOKEN), "login"); // "outra" instância

    for (let i = 0; i < 3; i++) await instanciaA.fail("student:DEMO-2345");
    for (let i = 0; i < 2; i++) await instanciaB.fail("student:DEMO-2345");

    // 5 falhas somadas entre duas instâncias diferentes → ambas enxergam o bloqueio
    expect(await instanciaA.isBlocked("student:DEMO-2345")).toBe(true);
    expect(await instanciaB.isBlocked("student:DEMO-2345")).toBe(true);
    expect(await instanciaB.isBlocked("student:OUTRO-0000")).toBe(false);

    await instanciaA.reset("student:DEMO-2345");
    expect(await instanciaB.isBlocked("student:DEMO-2345")).toBe(false);
  });

  it("a chave tem validade (o bloqueio não é eterno) e só a 1ª falha define a janela", async () => {
    const store = createUpstashStore(url, TOKEN);
    await store.increment("k", 60_000);
    const first = data.get("k")!.expiresAt;
    expect(first).not.toBeNull();
    await new Promise((r) => setTimeout(r, 15));
    await store.increment("k", 60_000);
    expect(data.get("k")!.expiresAt).toBe(first); // NX: não renova a janela a cada falha
    expect(data.get("k")!.value).toBe(2);
  });

  it("nenhum identificador em texto puro chega ao servidor", async () => {
    const limiter = createLimiter(5, 900000, createUpstashStore(url, TOKEN), "login");
    await limiter.fail("adult:ana@escola.com");
    for (const key of data.keys()) {
      expect(key).toMatch(/^rl:[0-9a-f]{64}$/);
      expect(key).not.toContain("ana@escola.com");
    }
  });

  it("token errado: o Upstash recusa e o fallback mantém o login funcionando", async () => {
    const wrong = createUpstashStore(url, "token-errado");
    await expect(wrong.count("k")).rejects.toThrow("401");

    const limiter = createLimiter(2, 1000, withFallback(wrong, createMemoryStore()), "t");
    await limiter.fail("k");
    await limiter.fail("k");
    expect(await limiter.isBlocked("k")).toBe(true);
  });

  it("servidor fora do ar: erro rápido (timeout curto) e fallback", async () => {
    const dead = createUpstashStore("http://127.0.0.1:1", TOKEN);
    const limiter = createLimiter(1, 1000, withFallback(dead, createMemoryStore()), "t");
    await limiter.fail("k");
    expect(await limiter.isBlocked("k")).toBe(true);
  });
});
