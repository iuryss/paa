import { decodeTyped, encodeTyped, hasMath, parseMath, parseNumber, sameNumber, spokenMath } from "./math";

describe("parseMath", () => {
  it("potência, fração e raiz no meio do texto", () => {
    expect(parseMath("Calcule 2^3 e 1/2 e raiz(9).")).toEqual([
      { kind: "text", text: "Calcule " },
      { kind: "power", base: "2", exponent: "3" },
      { kind: "text", text: " e " },
      { kind: "fraction", top: "1", bottom: "2" },
      { kind: "text", text: " e " },
      { kind: "root", value: "9" },
      { kind: "text", text: "." },
    ]);
  });

  it("expoente negativo, letra, parênteses e √", () => {
    expect(parseMath("2^-3")).toEqual([{ kind: "power", base: "2", exponent: "-3" }]);
    expect(parseMath("x^2")).toEqual([{ kind: "power", base: "x", exponent: "2" }]);
    expect(parseMath("(1/2)^3")).toEqual([{ kind: "power", base: "(1/2)", exponent: "3" }]);
    expect(parseMath("√5")).toEqual([{ kind: "root", value: "5" }]);
    expect(parseMath("-3/4")).toEqual([{ kind: "fraction", top: "-3", bottom: "4" }]);
  });

  it("não confunde texto comum: datas, palavras e unidades continuam iguais", () => {
    for (const text of ["12/10/2026", "metro^2", "km/h", "e/ou", "Sem conta nenhuma.", "3,5/2"]) {
      expect(hasMath(text)).toBe(false);
    }
  });
});

describe("spokenMath", () => {
  it("lê do jeito falado", () => {
    expect(spokenMath("2^-3 = 1/8")).toBe("2 elevado a menos 3 = 1 sobre 8");
    expect(spokenMath("raiz(16)")).toBe("raiz de 16");
    expect(spokenMath("Sem conta.")).toBe("Sem conta.");
  });
});

describe("parseNumber e sameNumber", () => {
  it("aceita inteiro, negativo, vírgula, ponto e fração", () => {
    expect(parseNumber("3")).toBe(3);
    expect(parseNumber(" -3 ")).toBe(-3);
    expect(parseNumber("0,5")).toBe(0.5);
    expect(parseNumber("0.5")).toBe(0.5);
    expect(parseNumber("1/8")).toBe(0.125);
  });

  it("recusa o que não é número (e divisão por zero)", () => {
    for (const text of ["", "abc", "1/0", "1,2,3", "--2", "1/", ","]) expect(parseNumber(text)).toBeNull();
  });

  it("respostas equivalentes valem; diferentes não", () => {
    expect(sameNumber("1/2", "0,5")).toBe(true);
    expect(sameNumber("2/4", "1/2")).toBe(true);
    expect(sameNumber("0.1", "1/10")).toBe(true);
    expect(sameNumber("1/2", "1/3")).toBe(false);
    expect(sameNumber("x", "x")).toBe(false);
  });
});

describe("encodeTyped / decodeTyped (telemetria)", () => {
  it("ida e volta, sempre dentro do formato aceito pelo optionId", () => {
    for (const answer of ["8", "-3", "1/8", "0,5", "-2/4"]) {
      const id = encodeTyped(answer)!;
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(decodeTyped(id)).toBe(answer);
    }
    expect(encodeTyped("0.5")).toBe("n-0c5");
  });

  it("recusa outros caracteres", () => {
    expect(encodeTyped("abc")).toBeNull();
    expect(encodeTyped("1234567890123")).toBeNull();
    expect(decodeTyped("o-gato")).toBeNull();
  });
});
