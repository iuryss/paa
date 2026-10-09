import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
  it("remove tags HTML", () => {
    expect(sanitizeText("<script>alert(1)</script>Oi")).toBe("alert(1)Oi");
  });

  it("remove caracteres de controle e colapsa espaços", () => {
    expect(sanitizeText("  a\u0000b \n\t c  ")).toBe("ab c");
  });

  it("preserva acentos", () => {
    expect(sanitizeText("Conceição")).toBe("Conceição");
  });
});
