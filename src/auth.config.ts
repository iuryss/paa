import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

const isProd = process.env.NODE_ENV === "production";

/**
 * Parte da configuração segura para o Edge (middleware): sem Prisma e sem bcrypt.
 * Cookie de sessão: HttpOnly, SameSite=Lax, Secure em produção, prefixo __Secure- em produção.
 */
export const authConfig = {
  pages: { signIn: "/entrar" },
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  useSecureCookies: isProd,
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: isProd },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid && token.role) {
        session.user.id = token.uid;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
