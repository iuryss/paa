import {
  lookForText,
  MARKER_STYLES,
  MAX_MARKERS,
  markerFor,
  resolveMarkerStyle,
  tapHighlightedText,
} from "./markers";

describe("markerFor", () => {
  it("cores e formas: cada posição tem forma e cor próprias", () => {
    const markers = Array.from({ length: MAX_MARKERS }, (_, i) => markerFor(i, "CORES_E_FORMAS"));
    expect(markers.map((m) => m.name)).toEqual([
      "círculo azul",
      "triângulo amarelo",
      "quadrado verde",
      "estrela roxa",
    ]);
    expect(new Set(markers.map((m) => m.shape)).size).toBe(MAX_MARKERS);
    expect(new Set(markers.map((m) => m.color)).size).toBe(MAX_MARKERS);
  });

  it("só formas: sem cor, e o nome é só a forma", () => {
    expect(markerFor(1, "FORMAS")).toEqual({ shape: "triangulo", color: null, name: "triângulo", article: "o" });
    expect(markerFor(3, "FORMAS")).toMatchObject({ name: "estrela", article: "a" });
  });

  it("só cores: a mesma forma em todas, o nome diz a cor", () => {
    const markers = [0, 1, 2, 3].map((i) => markerFor(i, "CORES"));
    expect(new Set(markers.map((m) => m.shape))).toEqual(new Set(["circulo"]));
    expect(markers.map((m) => m.name)).toEqual(["cor azul", "cor amarelo", "cor verde", "cor roxo"]);
  });

  it("todos os estilos têm nomes diferentes por posição (a dica nunca é ambígua)", () => {
    for (const style of MARKER_STYLES) {
      const names = [0, 1, 2, 3].map((i) => markerFor(i, style).name);
      expect(new Set(names).size).toBe(4);
    }
  });
});

describe("resolveMarkerStyle", () => {
  it("no Foco Alto (monocromático) vira sempre só formas", () => {
    for (const style of MARKER_STYLES) expect(resolveMarkerStyle(style, "foco")).toBe("FORMAS");
  });

  it("nos outros temas respeita a escolha do professor", () => {
    expect(resolveMarkerStyle("CORES", "calmo")).toBe("CORES");
    expect(resolveMarkerStyle("CORES_E_FORMAS", "contraste")).toBe("CORES_E_FORMAS");
  });
});

describe("textos das dicas", () => {
  it("concorda o artigo com a forma", () => {
    expect(lookForText(markerFor(1, "CORES_E_FORMAS"))).toBe("Procure o triângulo amarelo.");
    expect(lookForText(markerFor(3, "CORES_E_FORMAS"))).toBe("Procure a estrela roxa.");
    expect(lookForText(markerFor(0, "CORES"))).toBe("Procure a cor azul.");
  });

  it("o destaque também nomeia o marcador", () => {
    expect(tapHighlightedText(markerFor(0, "FORMAS"))).toBe("Toque no círculo, que está em destaque.");
    expect(tapHighlightedText(markerFor(3, "FORMAS"))).toBe("Toque na estrela, que está em destaque.");
  });
});
