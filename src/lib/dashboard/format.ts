const TZ = "America/Sao_Paulo";

export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(date);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 95_000 → "1 min 35 s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `${sec} s`;
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export function formatFullDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(date);
}

/** 1.5 → "1,5". */
export function formatDecimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/**
 * Como ler a mudança entre o início e agora.
 * - "more": porcentagem em que mais é melhor (autonomia, acertos).
 * - "less": porcentagem em que menos é melhor (sessões com ajuda do adulto).
 * - "faster": tempo em ms, em que menos é melhor.
 * Diferenças pequenas (menos de 5 pontos, ou menos de 10% do tempo) contam como estáveis.
 */
export type ChangeKind = "more" | "less" | "faster";
export type ChangeReading = "melhorou" | "estável" | "precisa de atenção";

export function describeChange(
  kind: ChangeKind,
  start: number,
  now: number,
): { text: string; reading: ChangeReading } | null {
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  if (kind === "faster") {
    if (start <= 0 || now <= 0) return null;
    const delta = now - start;
    const reading = Math.abs(delta) < start * 0.1 ? "estável" : delta < 0 ? "melhorou" : "precisa de atenção";
    return { text: `${sign(delta)}${formatSeconds(Math.abs(delta))}`, reading };
  }
  const points = Math.round((now - start) * 100);
  const better = kind === "more" ? points > 0 : points < 0;
  const reading = Math.abs(points) < 5 ? "estável" : better ? "melhorou" : "precisa de atenção";
  return { text: `${sign(points)}${Math.abs(points)} ${Math.abs(points) === 1 ? "ponto" : "pontos"}`, reading };
}
