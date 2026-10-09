import {
  summarizeByModule,
  summarizeSession,
  summarizeStudent,
  trendOf,
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
