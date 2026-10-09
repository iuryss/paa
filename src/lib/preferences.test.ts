import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from "./preferences";

const mockFind = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    sensoryProfile: {
      findUnique: (...a: unknown[]) => mockFind(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
    },
  },
}));

beforeEach(() => {
  mockFind.mockReset();
  mockUpsert.mockReset().mockResolvedValue({});
});

describe("loadPreferences", () => {
  it("converte o perfil do banco para os ids do design system", async () => {
    mockFind.mockResolvedValue({
      theme: "CONTRASTE",
      contentMode: "PICTOGRAFICO",
      fontFamily: "LEITURA",
      reducedMotion: false,
      soundEnabled: true,
    });
    await expect(loadPreferences("u1")).resolves.toEqual({
      theme: "contraste",
      contentMode: "pictografico",
      font: "leitura",
      reducedMotion: false,
      soundEnabled: true,
    });
    expect(mockFind).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("sem perfil, usa o padrão de baixo estímulo", async () => {
    mockFind.mockResolvedValue(null);
    await expect(loadPreferences("u1")).resolves.toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES).toMatchObject({ theme: "calmo", reducedMotion: true, soundEnabled: false });
  });

  it("se o banco falhar, não quebra a tela: devolve o padrão", async () => {
    mockFind.mockRejectedValue(new Error("db off"));
    await expect(loadPreferences("u1")).resolves.toEqual(DEFAULT_PREFERENCES);
  });
});

describe("savePreferences", () => {
  it("grava com upsert no formato do banco", async () => {
    await savePreferences("u1", {
      theme: "foco",
      contentMode: "textual",
      font: "sans",
      reducedMotion: true,
      soundEnabled: false,
    });
    const data = {
      theme: "FOCO",
      contentMode: "TEXTUAL",
      fontFamily: "SANS",
      reducedMotion: true,
      soundEnabled: false,
    };
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: data,
      create: { userId: "u1", ...data },
    });
  });
});
