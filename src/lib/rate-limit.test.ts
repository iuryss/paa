import { createLimiter } from "./rate-limit";

describe("createLimiter", () => {
  it("bloqueia após atingir o máximo de falhas", () => {
    const l = createLimiter(3, 1000, () => 0);
    l.fail("k");
    l.fail("k");
    expect(l.isBlocked("k")).toBe(false);
    l.fail("k");
    expect(l.isBlocked("k")).toBe(true);
  });

  it("isola chaves diferentes", () => {
    const l = createLimiter(1, 1000, () => 0);
    l.fail("a");
    expect(l.isBlocked("a")).toBe(true);
    expect(l.isBlocked("b")).toBe(false);
  });

  it("libera depois da janela de tempo", () => {
    let t = 0;
    const l = createLimiter(1, 1000, () => t);
    l.fail("k");
    expect(l.isBlocked("k")).toBe(true);
    t = 1001;
    expect(l.isBlocked("k")).toBe(false);
  });

  it("reset limpa as falhas", () => {
    const l = createLimiter(1, 1000, () => 0);
    l.fail("k");
    l.reset("k");
    expect(l.isBlocked("k")).toBe(false);
  });
});
