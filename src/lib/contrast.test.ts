import { contrastRatio, hexToRgb } from "./contrast";

describe("contrast", () => {
  it("preto sobre branco = 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("é simétrico", () => {
    expect(contrastRatio("#334155", "#f1f5f9")).toBeCloseTo(contrastRatio("#f1f5f9", "#334155"), 5);
  });

  it("converte hex em RGB e rejeita formato inválido", () => {
    expect(hexToRgb("#0a0a0a")).toEqual([10, 10, 10]);
    expect(() => hexToRgb("vermelho")).toThrow();
  });
});
