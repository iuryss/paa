import type { Role } from "@prisma/client";

export const ADULT_ROLES: readonly Role[] = ["TEACHER", "THERAPIST"];
export const STUDENT_ROLES: readonly Role[] = ["STUDENT"];

interface RouteRule {
  prefix: string;
  roles: readonly Role[];
}

/** Áreas restritas por papel. Qualquer rota fora daqui exige apenas estar autenticado. */
const RULES: readonly RouteRule[] = [
  { prefix: "/professor", roles: ADULT_ROLES },
  { prefix: "/api/professor", roles: ADULT_ROLES },
  { prefix: "/aluno", roles: STUDENT_ROLES },
  { prefix: "/api/aluno", roles: STUDENT_ROLES },
];

const PUBLIC_EXACT = new Set(["/"]);
const PUBLIC_PREFIXES = [
  "/entrar",
  "/convite",
  "/esqueci-senha",
  "/redefinir-senha",
  "/privacidade",
  "/termo",
  "/api/auth",
  "/api/health",
];

export type AccessDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string }
  | { type: "deny"; status: 401 | 403 };

export function isAdultRole(role: Role | null | undefined): boolean {
  return role === "TEACHER" || role === "THERAPIST";
}

export function roleHome(role: Role): string {
  return role === "STUDENT" ? "/aluno" : "/professor";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalize(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
}

/**
 * Decide o acesso a uma rota. Função pura: usada pelo middleware e testável sem Next.
 * Negação por padrão: rota desconhecida exige autenticação.
 */
export function decideAccess(rawPathname: string, role: Role | null): AccessDecision {
  const pathname = normalize(rawPathname);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  // /entrar é sempre acessível aqui: o middleware só enxerga o JWT, que pode estar "vivo" mesmo com a
  // conta já desativada. Quem decide mandar o usuário logado para a home é a PÁGINA (consulta o banco).
  // Se o middleware redirecionasse, uma sessão revogada geraria loop /entrar ⇄ /aluno.

  if (PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return { type: "allow" };
  }

  if (!role) {
    return isApi ? { type: "deny", status: 401 } : { type: "redirect", to: "/entrar" };
  }

  const rule = RULES.find((r) => matchesPrefix(pathname, r.prefix));
  if (rule && !rule.roles.includes(role)) {
    return isApi ? { type: "deny", status: 403 } : { type: "redirect", to: roleHome(role) };
  }

  return { type: "allow" };
}
