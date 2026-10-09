import { checkHealth } from "./health";

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => mockQuery(...a) },
}));

describe("checkHealth", () => {
  it("ok quando o banco responde", async () => {
    mockQuery.mockResolvedValue([{ "?column?": 1 }]);
    await expect(checkHealth()).resolves.toEqual({ status: "ok", db: true });
  });

  it("degraded (sem vazar o erro) quando o banco falha", async () => {
    mockQuery.mockRejectedValue(new Error("password authentication failed for user tea"));
    const result = await checkHealth();
    expect(result).toEqual({ status: "degraded", db: false });
    expect(JSON.stringify(result)).not.toMatch(/password|tea/);
  });
});
