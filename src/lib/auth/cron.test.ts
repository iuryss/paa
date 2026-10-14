import { isCronAuthorized } from "./cron";

const SECRET = "segredo-do-cron-com-mais-de-16";

describe("isCronAuthorized", () => {
  it("aceita só o cabeçalho Bearer com o segredo exato", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([
    ["sem cabeçalho", null],
    ["vazio", ""],
    ["segredo errado", "Bearer outro-segredo-com-o-mesmo-tamanho!"],
    ["sem o prefixo Bearer", SECRET],
    ["com espaço no fim", `Bearer ${SECRET} `],
    ["maiúsculas diferentes", `bearer ${SECRET}`],
  ])("recusa %s", (_name, header) => {
    expect(isCronAuthorized(header, SECRET)).toBe(false);
  });

  it("sem segredo configurado (ou fraco), ninguém entra, nem com cabeçalho vazio", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer curto", "curto")).toBe(false);
  });
});
