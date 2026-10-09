import { guard } from "./guard";

const mockAuth = jest.fn();
jest.mock("@/auth", () => ({ auth: () => mockAuth() }));

describe("guard", () => {
  it("401 sem sessão", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(guard(["TEACHER"])).resolves.toEqual({
      ok: false,
      status: 401,
      code: "unauthenticated",
    });
  });

  it("403 com papel não permitido", async () => {
    mockAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    await expect(guard(["TEACHER", "THERAPIST"])).resolves.toEqual({
      ok: false,
      status: 403,
      code: "forbidden",
    });
  });

  it("ok com papel permitido", async () => {
    mockAuth.mockResolvedValue({ user: { id: "t1", role: "THERAPIST" } });
    await expect(guard(["TEACHER", "THERAPIST"])).resolves.toEqual({
      ok: true,
      user: { id: "t1", role: "THERAPIST" },
    });
  });
});
