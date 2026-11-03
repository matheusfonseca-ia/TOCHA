import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Limite de tentativas por e-mail, com o Rate Limiting nativo do Workers
 * (bindings `[[ratelimits]]` no wrangler.toml). Complementa a regra por IP do
 * WAF da Cloudflare: a de IP não pega quem testa senhas de vários IPs contra o
 * mesmo e-mail, esta pega.
 *
 * O contador é por local da Cloudflare e eventualmente consistente: é um freio,
 * não uma contagem exata. Por isso falha aberto (sem binding ou com erro, libera):
 * travar o login de todo mundo por um defeito do limitador é pior que deixar
 * passar algumas tentativas a mais.
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type AuthAction = "login" | "reset";

const BINDINGS: Record<AuthAction, string> = {
  login: "LOGIN_RATE_LIMITER",
  reset: "RESET_RATE_LIMITER",
};

/** Chave do balde: ação + SHA-256 do e-mail normalizado (o e-mail não vai em texto puro). */
export async function limiterKey(action: AuthAction, email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${action}:${hex}`;
}

export async function allowAttempt(
  limiter: RateLimiter | undefined,
  action: AuthAction,
  email: string,
): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key: await limiterKey(action, email) });
    return success;
  } catch (err) {
    console.error("[rate-limit] limitador falhou, liberando:", err instanceof Error ? err.message : err);
    return true;
  }
}

function bindingFor(action: AuthAction): RateLimiter | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const binding = env[BINDINGS[action]] as RateLimiter | undefined;
    return typeof binding?.limit === "function" ? binding : undefined;
  } catch {
    // Fora do Worker (next dev, vitest) não há contexto da Cloudflare.
    return undefined;
  }
}

/** Para as server actions: lê o binding do Worker e consulta o limite. */
export async function allowAuthAttempt(action: AuthAction, email: string): Promise<boolean> {
  return allowAttempt(bindingFor(action), action, email);
}
