import { isAccountActive } from "./account-active";

const mockFind = jest.fn();
jest.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => mockFind(...a) } },
}));

beforeEach(() => mockFind.mockReset());

describe("isAccountActive", () => {
  it("true só para conta existente e ativa", async () => {
    mockFind.mockResolvedValue({ active: true });
    await expect(isAccountActive("u1")).resolves.toBe(true);
    expect(mockFind).toHaveBeenCalledWith({ where: { id: "u1" }, select: { active: true } });
  });

  it.each([
    ["desativada (consentimento revogado)", { active: false }],
    ["excluída", null],
  ])("false para conta %s", async (_name, row) => {
    mockFind.mockResolvedValue(row);
    await expect(isAccountActive("u1")).resolves.toBe(false);
  });

  it("false sem id, sem consultar o banco", async () => {
    await expect(isAccountActive(undefined)).resolves.toBe(false);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("falha fechada: erro no banco não mantém a sessão viva", async () => {
    mockFind.mockRejectedValue(new Error("db off"));
    await expect(isAccountActive("u1")).resolves.toBe(false);
  });
});
