import { decideAccess, roleHome } from "./rbac";

describe("decideAccess", () => {
  describe("rotas públicas", () => {
    it.each(["/", "/entrar", "/api/auth/session", "/api/auth/callback/adult", "/api/health", "/convite/abc", "/esqueci-senha", "/redefinir-senha/abc", "/privacidade", "/termo"])(
      "libera %s sem login",
      (path) => {
        expect(decideAccess(path, null)).toEqual({ type: "allow" });
      },
    );

    it("/entrar nunca redireciona no middleware (a página confere no banco; evita loop com sessão revogada)", () => {
      expect(decideAccess("/entrar", "STUDENT")).toEqual({ type: "allow" });
      expect(decideAccess("/entrar", "TEACHER")).toEqual({ type: "allow" });
      expect(decideAccess("/entrar", null)).toEqual({ type: "allow" });
    });
  });

  describe("sem sessão", () => {
    it("redireciona páginas para /entrar", () => {
      expect(decideAccess("/professor", null)).toEqual({ type: "redirect", to: "/entrar" });
      expect(decideAccess("/aluno/atividades", null)).toEqual({ type: "redirect", to: "/entrar" });
    });

    it("responde 401 em APIs", () => {
      expect(decideAccess("/api/professor/alunos", null)).toEqual({ type: "deny", status: 401 });
    });

    it("nega por padrão rotas desconhecidas", () => {
      expect(decideAccess("/qualquer-coisa", null)).toEqual({ type: "redirect", to: "/entrar" });
    });
  });

  describe("área do professor/terapeuta", () => {
    it.each(["TEACHER", "THERAPIST"] as const)("%s acessa /professor e sua API", (role) => {
      expect(decideAccess("/professor", role)).toEqual({ type: "allow" });
      expect(decideAccess("/professor/atividades/nova", role)).toEqual({ type: "allow" });
      expect(decideAccess("/api/professor/alunos", role)).toEqual({ type: "allow" });
    });

    it("STUDENT é barrado: redirect em página, 403 em API", () => {
      expect(decideAccess("/professor", "STUDENT")).toEqual({ type: "redirect", to: "/aluno" });
      expect(decideAccess("/professor/dashboard", "STUDENT")).toEqual({
        type: "redirect",
        to: "/aluno",
      });
      expect(decideAccess("/api/professor/alunos", "STUDENT")).toEqual({
        type: "deny",
        status: 403,
      });
    });
  });

  describe("área do aluno", () => {
    it("STUDENT acessa /aluno e sua API", () => {
      expect(decideAccess("/aluno", "STUDENT")).toEqual({ type: "allow" });
      expect(decideAccess("/api/aluno/sessoes", "STUDENT")).toEqual({ type: "allow" });
    });

    it("adultos são redirecionados para o painel", () => {
      expect(decideAccess("/aluno", "TEACHER")).toEqual({ type: "redirect", to: "/professor" });
      expect(decideAccess("/api/aluno/sessoes", "THERAPIST")).toEqual({
        type: "deny",
        status: 403,
      });
    });
  });

  describe("tentativas de contornar o casamento de rota", () => {
    it("não confunde prefixos parecidos (/professores não é /professor)", () => {
      expect(decideAccess("/professores", "STUDENT")).toEqual({ type: "allow" });
      // …mas continua exigindo login
      expect(decideAccess("/professores", null)).toEqual({ type: "redirect", to: "/entrar" });
    });

    it("normaliza barras duplicadas e finais", () => {
      expect(decideAccess("//professor//", "STUDENT")).toEqual({ type: "redirect", to: "/aluno" });
      expect(decideAccess("/api//professor/alunos/", "STUDENT")).toEqual({
        type: "deny",
        status: 403,
      });
    });
  });
});

describe("roleHome", () => {
  it("mapeia papel para home", () => {
    expect(roleHome("STUDENT")).toBe("/aluno");
    expect(roleHome("TEACHER")).toBe("/professor");
    expect(roleHome("THERAPIST")).toBe("/professor");
  });
});
