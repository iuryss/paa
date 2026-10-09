import { redact } from "./logger";

describe("redact", () => {
  it("mascara PII e segredos, inclusive aninhados", () => {
    const out = redact({
      event: "x",
      email: "a@b.com",
      user: { PIN: "1234", studentCode: "DEMO-2345", name: "ok" },
      list: [{ token: "t" }],
    });
    expect(out).toEqual({
      event: "x",
      email: "[REDACTED]",
      user: { PIN: "[REDACTED]", studentCode: "[REDACTED]", name: "ok" },
      list: [{ token: "[REDACTED]" }],
    });
  });

  it("mantém valores primitivos", () => {
    expect(redact("texto")).toBe("texto");
    expect(redact(null)).toBeNull();
  });
});
