import { preferencesSchema } from "./preferences";

const valid = {
  theme: "calmo",
  contentMode: "textual",
  font: "sans",
  reducedMotion: true,
  soundEnabled: false,
};

describe("preferencesSchema", () => {
  it("aceita preferências válidas", () => {
    expect(preferencesSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { theme: "escuro" },
    { contentMode: "audio" },
    { font: "comic" },
    { reducedMotion: "sim" },
    { role: "TEACHER" }, // campo extra
  ])("rejeita %p", (patch) => {
    expect(preferencesSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("rejeita entrada que não é objeto", () => {
    expect(preferencesSchema.safeParse(null).success).toBe(false);
    expect(preferencesSchema.safeParse("calmo").success).toBe(false);
  });
});
