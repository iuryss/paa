import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { authConfig } from "./auth.config";

const { jwt, session } = authConfig.callbacks;

describe("authConfig", () => {
  it("cookie de sessão é HttpOnly e SameSite=Lax", () => {
    expect(authConfig.cookies.sessionToken.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("sessão dura no máximo 8h e é JWT", () => {
    expect(authConfig.session).toEqual({ strategy: "jwt", maxAge: 28800 });
  });

  it("jwt grava id e papel no login", () => {
    const token = jwt({
      token: {} as JWT,
      user: { id: "u1", role: "TEACHER" } as User,
    } as Parameters<typeof jwt>[0]);
    expect(token).toMatchObject({ uid: "u1", role: "TEACHER" });
  });

  it("jwt mantém o token nas chamadas seguintes", () => {
    const token = { uid: "u1", role: "STUDENT" } as JWT;
    expect(jwt({ token } as Parameters<typeof jwt>[0])).toBe(token);
  });

  it("session expõe id e papel, sem e-mail", () => {
    const out = session({
      session: { user: { name: "Sol" }, expires: "x" } as unknown as Session,
      token: { uid: "u1", role: "STUDENT" } as JWT,
    } as Parameters<typeof session>[0]) as Session;
    expect(out.user).toMatchObject({ id: "u1", role: "STUDENT", name: "Sol" });
    expect(out.user).not.toHaveProperty("email");
  });
});
