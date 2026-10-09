import { getDummyHash, hashSecret, verifySecret } from "./password";

describe("password", () => {
  it("gera hash que não contém o segredo e verifica corretamente", async () => {
    const hash = await hashSecret("1234");
    expect(hash).not.toContain("1234");
    await expect(verifySecret("1234", hash)).resolves.toBe(true);
    await expect(verifySecret("4321", hash)).resolves.toBe(false);
  });

  it("reaproveita o hash descartável", async () => {
    expect(await getDummyHash()).toBe(await getDummyHash());
  });
});
