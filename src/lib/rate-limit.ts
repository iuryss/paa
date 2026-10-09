interface Entry {
  count: number;
  firstAt: number;
}

export interface Limiter {
  isBlocked(key: string): boolean;
  fail(key: string): void;
  reset(key: string): void;
}

/**
 * Bloqueio por chave após `max` falhas na janela `windowMs`.
 * Em memória: vale por instância. Em produção com várias instâncias, trocar por Redis/Upstash.
 */
export function createLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): Limiter {
  const entries = new Map<string, Entry>();

  const current = (key: string): Entry | undefined => {
    const entry = entries.get(key);
    if (entry && now() - entry.firstAt > windowMs) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    isBlocked: (key) => (current(key)?.count ?? 0) >= max,
    fail: (key) => {
      const entry = current(key);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, firstAt: now() });
    },
    reset: (key) => {
      entries.delete(key);
    },
  };
}

/** 5 falhas em 15 minutos bloqueiam novas tentativas (PIN de 4 dígitos exige isso). */
export const loginLimiter = createLimiter(5, 15 * 60 * 1000);
