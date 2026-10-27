// O app mora em falow.app.br/sistema; a raiz do domínio é a landing (outro site).
// BASE_PATH tem que bater com o `basePath` do next.config.mjs. O Next prefixa
// sozinho Link, router e redirect(); <a href>, <form action> e history.replaceState
// crus não, por isso passam por withBasePath().
export const BASE_PATH = "/sistema";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}

/**
 * URL absoluta de uma rota do app. NEXT_PUBLIC_APP_URL já inclui o /sistema
 * (https://falow.app.br/sistema); `new URL("/x", appUrl)` descartaria esse
 * caminho, então toda URL absoluta sai daqui.
 */
export function appUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL!.replace(/\/+$/, "")}${path}`;
}
