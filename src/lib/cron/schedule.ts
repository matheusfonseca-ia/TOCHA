// Parte pura do scheduled() do Worker (worker.ts): qual rota cada cron dispara
// e como montar a requisicao. Fica fora do worker.ts para ser testavel; o
// worker importa por caminho relativo (o wrangler nao resolve o alias `@/`).

/** Expressao do cron (igual ao `[triggers] crons` do wrangler.toml) -> rota que ele dispara. */
export const CRON_ROUTES: Record<string, string> = {
  "* * * * *": "/api/cron/sequences",
  "0 6 * * *": "/api/cron/purge",
};

// Inclui o /sistema (basePath do app); a raiz do dominio e a landing.
const DEFAULT_APP_URL = "https://falow.app.br/sistema";

/**
 * Monta a requisicao autenticada do cron, ou null se a expressao for desconhecida.
 * Sem CRON_SECRET a requisicao sai com `Bearer` vazio de proposito: a rota responde
 * 503 ("CRON_SECRET nao configurado") e o worker loga, em vez de o cron falhar calado.
 */
export function cronRequestFor(
  cron: string,
  env: { CRON_SECRET?: string; NEXT_PUBLIC_APP_URL?: string }
): Request | null {
  const path = CRON_ROUTES[cron];
  if (!path) return null;
  // Concatena em vez de new URL(path, base): com path absoluto o URL descartaria o /sistema.
  const base = (env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, "");
  return new Request(`${base}${path}`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
  });
}
