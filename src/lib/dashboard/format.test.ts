import {
  describeChange,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatFullDateTime,
  formatPercent,
  formatSeconds,
  formatShortDate,
} from "./format";

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

describe("relatório detalhado", () => {
  it("data completa e decimal com vírgula", () => {
    expect(formatFullDateTime(new Date("2026-10-07T13:05:00Z"))).toMatch(/07\/10\/2026.*10:05/);
    expect(formatDecimal(1.25)).toBe("1,3");
    expect(formatDecimal(2)).toBe("2,0");
  });

  it("autonomia e acertos: subir é melhorar", () => {
    expect(describeChange("more", 0.4, 0.65)).toEqual({ text: "+25 pontos", reading: "melhorou" });
    expect(describeChange("more", 0.7, 0.5)).toEqual({ text: "−20 pontos", reading: "precisa de atenção" });
    expect(describeChange("more", 0.5, 0.53)).toEqual({ text: "+3 pontos", reading: "estável" });
    expect(describeChange("more", 0.5, 0.51)).toEqual({ text: "+1 ponto", reading: "estável" });
    expect(describeChange("more", 0.5, 0.5)).toEqual({ text: "0 pontos", reading: "estável" });
  });

  it("ajuda do adulto: descer é melhorar", () => {
    expect(describeChange("less", 2 / 3, 0)).toEqual({ text: "−67 pontos", reading: "melhorou" });
    expect(describeChange("less", 0, 0.5)).toEqual({ text: "+50 pontos", reading: "precisa de atenção" });
  });

  it("tempo: ficar mais rápido é melhorar; sem tempo medido não compara", () => {
    expect(describeChange("faster", 8000, 5000)).toEqual({ text: "−3,0 s", reading: "melhorou" });
    expect(describeChange("faster", 5000, 5300)).toEqual({ text: "+0,3 s", reading: "estável" });
    expect(describeChange("faster", 4000, 6000)).toEqual({ text: "+2,0 s", reading: "precisa de atenção" });
    expect(describeChange("faster", 0, 5000)).toBeNull();
  });
});
