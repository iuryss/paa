import {
  engagementOf,
  helpByWeek,
  startVsNow,
  summarizeByActivity,
  summarizeByDifficulty,
  summarizeByModule,
  summarizeSession,
  summarizeStudent,
  trendOf,
  weekStart,
  type AttemptInput,
  type SessionInput,
  type SessionMetrics,
} from "./metrics";

const session: SessionInput = {
  id: "s1",
  activityTitle: "Letras",
  module: "GRAFIA",
  startedAt: new Date("2026-10-01T10:00:00Z"),
  durationMs: 60_000,
  totalAttempts: 4,
  correctCount: 3,
  redirects: 1,
  maxHelpLevel: "VERBAL_HINT",
};

const att = (over: Partial<AttemptInput>): AttemptInput => ({
  sessionId: "s1",
  itemKey: "a",
  correct: true,
  helpLevel: "NONE",
  elapsedMs: 2000,
  attemptNo: 1,
  ...over,
});

describe("summarizeSession", () => {
  it("autonomia = itens certos de primeira e sem ajuda ÷ itens", () => {
    const m = summarizeSession(session, [
      att({ itemKey: "a" }), // independente
      att({ itemKey: "b", correct: false, attemptNo: 1, elapsedMs: 1000 }),
      att({ itemKey: "b", correct: true, attemptNo: 2, elapsedMs: 5000 }), // precisou de 2 tentativas
      att({ itemKey: "c", helpLevel: "VERBAL_HINT" }), // acertou, mas com dica
      att({ itemKey: "d" }), // independente
    ]);
    expect(m.items).toBe(4);
    expect(m.independence).toBeCloseTo(2 / 4);
  });

  it("acerto = certas ÷ tentativas da sessão", () => {
    expect(summarizeSession(session, []).accuracy).toBeCloseTo(3 / 4);
  });

  it("tempo médio considera o momento do acerto de cada item", () => {
    const m = summarizeSession(session, [
      att({ itemKey: "a", elapsedMs: 2000 }),
      att({ itemKey: "b", correct: false, elapsedMs: 900, attemptNo: 1 }),
      att({ itemKey: "b", correct: true, elapsedMs: 4000, attemptNo: 2 }),
    ]);
    expect(m.avgItemMs).toBe(3000);
  });

  it("não depende da ordem em que as tentativas chegam", () => {
    const m = summarizeSession(session, [
      att({ itemKey: "b", correct: true, attemptNo: 2 }),
      att({ itemKey: "b", correct: false, attemptNo: 1 }),
    ]);
    expect(m.independence).toBe(0);
  });

  it("sessão vazia não gera NaN nem divisão por zero", () => {
    const m = summarizeSession({ ...session, totalAttempts: 0, correctCount: 0, durationMs: null }, []);
    expect(m).toMatchObject({ accuracy: 0, independence: 0, avgItemMs: 0, durationMs: 0, items: 0 });
  });

  it("repassa o nível de ajuda e os redirecionamentos", () => {
    const m = summarizeSession(session, []);
    expect(m).toMatchObject({ helpLevel: "VERBAL_HINT", redirects: 1, attempts: 4 });
  });
});

describe("trendOf", () => {
  it("precisa de pelo menos 4 sessões", () => {
    expect(trendOf([0.1, 0.9, 0.9])).toBe("insufficient");
  });

  it("compara as 3 últimas com as 3 anteriores", () => {
    expect(trendOf([0.2, 0.2, 0.2, 0.6, 0.6, 0.6])).toBe("up");
    expect(trendOf([0.8, 0.8, 0.8, 0.4, 0.4, 0.4])).toBe("down");
    expect(trendOf([0.5, 0.5, 0.5, 0.52, 0.5, 0.51])).toBe("steady");
  });

  it("com 4 ou 5 sessões compara com as que existirem", () => {
    expect(trendOf([0.2, 0.6, 0.6, 0.6])).toBe("up");
  });
});

const metric = (over: Partial<SessionMetrics>): SessionMetrics => ({
  id: "x",
  activityTitle: "t",
  module: "GRAFIA",
  startedAt: new Date("2026-10-01T10:00:00Z"),
  durationMs: 60_000,
  items: 3,
  attempts: 3,
  redirects: 0,
  accuracy: 1,
  independence: 1,
  avgItemMs: 2000,
  helpLevel: "NONE",
  difficulty: null,
  ...over,
});

describe("summarizeStudent", () => {
  it("sem sessões: zeros e sem data", () => {
    expect(summarizeStudent([])).toMatchObject({
      sessions: 0,
      accuracy: 0,
      independence: 0,
      lastSessionAt: null,
      trend: "insufficient",
    });
  });

  it("agrega médias, totais e a distribuição de ajuda", () => {
    const s = summarizeStudent([
      metric({ id: "1", independence: 0.5, accuracy: 0.6, helpLevel: "VERBAL_HINT", redirects: 2, avgItemMs: 4000 }),
      metric({ id: "2", independence: 1, accuracy: 1, helpLevel: "NONE", startedAt: new Date("2026-10-03T10:00:00Z") }),
    ]);
    expect(s.sessions).toBe(2);
    expect(s.independence).toBeCloseTo(0.75);
    expect(s.accuracy).toBeCloseTo(0.8);
    expect(s.redirects).toBe(2);
    expect(s.avgItemMs).toBe(3000);
    expect(s.totalMs).toBe(120_000);
    expect(s.helpDistribution).toEqual({ NONE: 1, VERBAL_HINT: 1, VISUAL_HINT: 0, FULL_MODEL: 0 });
    expect(s.lastSessionAt).toEqual(new Date("2026-10-03T10:00:00Z"));
  });

  it("ordena por data antes de calcular tendência e última sessão", () => {
    const days = [1, 2, 3, 4, 5, 6];
    const sessions = days.map((d) =>
      metric({ id: String(d), independence: d <= 3 ? 0.2 : 0.8, startedAt: new Date(`2026-10-0${d}T10:00:00Z`) }),
    );
    expect(summarizeStudent([...sessions].reverse()).trend).toBe("up");
  });
});

describe("summarizeByModule", () => {
  it("agrupa por módulo", () => {
    const out = summarizeByModule([
      metric({ module: "GRAFIA", independence: 1 }),
      metric({ module: "GRAFIA", independence: 0.5 }),
      metric({ module: "MATEMATICA", independence: 0.2, avgItemMs: 0 }),
    ]);
    expect(out).toEqual([
      { module: "GRAFIA", sessions: 2, independence: 0.75, accuracy: 1, avgItemMs: 2000 },
      { module: "MATEMATICA", sessions: 1, independence: 0.2, accuracy: 1, avgItemMs: 0 },
    ]);
  });
});

describe("summarizeSession guarda a dificuldade", () => {
  it("usa a dificuldade registrada na sessão, ou null", () => {
    expect(summarizeSession({ ...session, difficulty: "AVANCADO" }, []).difficulty).toBe("AVANCADO");
    expect(summarizeSession(session, []).difficulty).toBeNull();
  });
});

describe("summarizeByDifficulty", () => {
  it("ordena do mais fácil ao mais difícil, com 'sem registro' no fim", () => {
    const rows = summarizeByDifficulty([
      metric({ id: "1", difficulty: "AVANCADO", independence: 0.2 }),
      metric({ id: "2", difficulty: null }),
      metric({ id: "3", difficulty: "INICIAL", independence: 1 }),
      metric({ id: "4", difficulty: "INICIAL", independence: 0.5 }),
    ]);
    expect(rows.map((r) => [r.difficulty, r.sessions])).toEqual([
      ["INICIAL", 2],
      ["AVANCADO", 1],
      [null, 1],
    ]);
    expect(rows[0]!.independence).toBeCloseTo(0.75);
  });
});

describe("summarizeByActivity", () => {
  it("agrupa por atividade e põe primeiro onde há menos autonomia", () => {
    const rows = summarizeByActivity([
      metric({ id: "1", activityTitle: "Letras", independence: 1 }),
      metric({ id: "2", activityTitle: "Contas", module: "MATEMATICA", independence: 0.2 }),
      metric({ id: "3", activityTitle: "Letras", independence: 0.6, startedAt: new Date("2026-10-04T10:00:00Z") }),
    ]);
    expect(rows.map((r) => r.title)).toEqual(["Contas", "Letras"]);
    expect(rows[1]).toMatchObject({ sessions: 2, lastAt: new Date("2026-10-04T10:00:00Z") });
    expect(rows[1]!.independence).toBeCloseTo(0.8);
  });

  it("mesmo título em módulos diferentes são atividades diferentes", () => {
    const rows = summarizeByActivity([
      metric({ id: "1", activityTitle: "Revisão", module: "GRAFIA" }),
      metric({ id: "2", activityTitle: "Revisão", module: "MATEMATICA" }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("startVsNow", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, d, 10));

  it("com menos de 4 sessões não compara", () => {
    expect(startVsNow([metric({})], [metric({})], 3)).toEqual({ status: "insufficient", total: 3, needed: 4 });
  });

  it("compara as 3 primeiras com as 3 últimas, em qualquer ordem de entrada", () => {
    const early = [3, 1, 2].map((d) => metric({ id: `e${d}`, startedAt: day(d), independence: 0.2, helpLevel: d === 1 ? "FULL_MODEL" : "NONE" }));
    const late = [20, 22, 21].map((d) => metric({ id: `l${d}`, startedAt: day(d), independence: 0.8, avgItemMs: 1000 }));
    const r = startVsNow(early, late, 10);
    if (r.status !== "ok") throw new Error("esperava ok");
    expect(r.start).toMatchObject({ sessions: 3, from: day(1), to: day(3) });
    expect(r.start.independence).toBeCloseTo(0.2);
    expect(r.start.adultHelpShare).toBeCloseTo(1 / 3);
    expect(r.now).toMatchObject({ sessions: 3, from: day(20), to: day(22), avgItemMs: 1000, adultHelpShare: 0 });
    expect(r.now.independence).toBeCloseTo(0.8);
  });

  it("com 4 ou 5 sessões usa 2 de cada lado, sem repetir sessão", () => {
    const all = [1, 2, 3, 4, 5].map((d) => metric({ id: String(d), startedAt: day(d) }));
    const r = startVsNow(all.slice(0, 3), all.slice(-3), 5);
    if (r.status !== "ok") throw new Error("esperava ok");
    expect([r.start.from, r.start.to]).toEqual([day(1), day(2)]);
    expect([r.now.from, r.now.to]).toEqual([day(4), day(5)]);
  });
});

describe("weekStart e helpByWeek", () => {
  it("a semana começa na segunda-feira, no horário de São Paulo", () => {
    // Domingo 11/10 às 23h em São Paulo = segunda 12/10 02h UTC: ainda é a semana de 05/10.
    expect(weekStart(new Date("2026-10-12T02:00:00Z"))).toEqual(new Date("2026-10-05T12:00:00Z"));
    expect(weekStart(new Date("2026-10-12T13:00:00Z"))).toEqual(new Date("2026-10-12T12:00:00Z"));
  });

  it("conta a ajuda por semana, em ordem", () => {
    const weeks = helpByWeek([
      metric({ id: "1", startedAt: new Date("2026-10-13T10:00:00Z"), helpLevel: "NONE", independence: 1 }),
      metric({ id: "2", startedAt: new Date("2026-10-06T10:00:00Z"), helpLevel: "FULL_MODEL", independence: 0 }),
      metric({ id: "3", startedAt: new Date("2026-10-07T10:00:00Z"), helpLevel: "NONE", independence: 0.5 }),
    ]);
    expect(weeks.map((w) => w.weekStart)).toEqual([new Date("2026-10-05T12:00:00Z"), new Date("2026-10-12T12:00:00Z")]);
    expect(weeks[0]).toMatchObject({ sessions: 2, noHelpShare: 0.5, independence: 0.25 });
    expect(weeks[0]!.help).toEqual({ NONE: 1, VERBAL_HINT: 0, VISUAL_HINT: 0, FULL_MODEL: 1 });
    expect(weeks[1]).toMatchObject({ sessions: 1, noHelpShare: 1 });
  });
});

describe("engagementOf", () => {
  it("taxa de conclusão, sessões por semana e dias com uso", () => {
    const e = engagementOf(
      [
        metric({ id: "1", startedAt: new Date("2026-10-01T10:00:00Z"), durationMs: 60_000 }),
        metric({ id: "2", startedAt: new Date("2026-10-01T15:00:00Z"), durationMs: 120_000 }),
        metric({ id: "3", startedAt: new Date("2026-10-03T10:00:00Z"), durationMs: 90_000 }),
      ],
      1,
      14,
    );
    expect(e).toMatchObject({ completed: 3, interrupted: 1, completionRate: 0.75, sessionsPerWeek: 1.5, activeDays: 2, avgSessionMs: 90_000 });
  });

  it("sem nenhuma sessão iniciada, a taxa de conclusão fica vazia", () => {
    expect(engagementOf([], 0, 7)).toMatchObject({ completionRate: null, sessionsPerWeek: 0, activeDays: 0 });
  });
});
