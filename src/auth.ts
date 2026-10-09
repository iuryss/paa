import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { isAccountActive } from "@/lib/auth/account-active";
import { authenticateAdult, authenticateStudent } from "@/lib/auth/authenticate";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Roda em runtime Node (o middleware usa só o authConfig, sem banco). Em toda leitura de sessão
     * confere se a conta segue ativa; devolver null encerra a sessão e limpa o cookie.
     */
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user) return token; // acabou de entrar: authorize() já validou a conta
      return (await isAccountActive(token.uid)) ? token : null;
    },
  },
  providers: [
    Credentials({
      id: "adult",
      credentials: { email: {}, password: {} },
      authorize: (credentials) => authenticateAdult(credentials),
    }),
    Credentials({
      id: "student",
      credentials: { studentCode: {}, pin: {} },
      authorize: (credentials) => authenticateStudent(credentials),
    }),
  ],
});
