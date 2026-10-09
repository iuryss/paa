import { formatDateTime, formatDuration, formatPercent, formatSeconds, formatShortDate } from "./format";

describe("format", () => {
  it("datas no fuso de São Paulo", () => {
    // 01:30 UTC ainda é o dia anterior em Brasília (UTC-3).
    expect(formatShortDate(new Date("2026-10-08T01:30:00Z"))).toBe("07/10");
    expect(formatDateTime(new Date("2026-10-07T13:05:00Z"))).toMatch(/07\/10.*10:05/);
  });

  it("duração legível", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(120_000)).toBe("2 min");
    expect(formatDuration(95_000)).toBe("1 min 35 s");
    expect(formatDuration(-5)).toBe("0 s");
  });

  it("porcentagem e segundos com vírgula", () => {
    expect(formatPercent(0.666)).toBe("67%");
    expect(formatSeconds(3250)).toBe("3,3 s");
  });
});
