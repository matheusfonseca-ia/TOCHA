/**
 * Decisão pura do middleware. Públicas: landing, as três páginas legais
 * cadastradas na Meta, o pós-compra e o "definir senha" (quem chega pelo
 * e-mail ainda não tem sessão). `/assinatura` exige login mas não exige
 * acesso — é para lá que vai quem perdeu o acesso.
 */
export const PUBLIC_PATHS = new Set([
  "/",
  "/privacidade",
  "/exclusao-de-dados",
  "/termos-de-servico",
  "/assinatura/obrigado",
  "/definir-senha",
]);

const NO_ACCESS_ALLOWED = new Set(["/assinatura"]);

export type Route = "next" | "/login" | "/dashboard" | "/assinatura";

export function routeFor(pathname: string, ctx: { loggedIn: boolean; hasAccess: boolean }): Route {
  if (PUBLIC_PATHS.has(pathname)) return "next";
  if (!ctx.loggedIn) return pathname === "/login" ? "next" : "/login";
  if (pathname === "/login") return ctx.hasAccess ? "/dashboard" : "/assinatura";
  if (!ctx.hasAccess && !NO_ACCESS_ALLOWED.has(pathname)) return "/assinatura";
  return "next";
}

/** Área do painel de admin: /admin e qualquer subrota. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
