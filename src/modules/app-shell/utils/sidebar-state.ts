/**
 * Estado da sidebar do painel (aberta ou recolhida), guardado em cookie pra o
 * servidor já renderizar na largura certa: sem "pulo" da sidebar ao carregar.
 *
 * A largura em si mora na variável CSS `--sidebar-w` (globals.css, classe
 * `.app-shell`). Tudo que encosta na sidebar (conteúdo, Conversas, Funil,
 * editor de Workflow) usa essa variável, então anima junto.
 */

export const SIDEBAR_COOKIE = "falow-sidebar";

/** Um ano: é preferência de quem usa, não sessão. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type SidebarState = "expanded" | "collapsed";

export function isCollapsedCookie(value: string | undefined | null): boolean {
  return value === "collapsed";
}

export function sidebarCookieString(collapsed: boolean): string {
  const state: SidebarState = collapsed ? "collapsed" : "expanded";
  return `${SIDEBAR_COOKIE}=${state}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}
