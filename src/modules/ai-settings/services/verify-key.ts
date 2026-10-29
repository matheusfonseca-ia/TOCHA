import type { AiProviderId } from "@/lib/ai/providers";

/**
 * Confere a chave no provedor antes de guardar, pra o erro de digitação
 * aparecer na hora e não só na primeira vez que alguém clica em ✨. As duas
 * consultas só listam/identificam a chave: não gastam crédito.
 */

const KEY_ENDPOINTS: Record<AiProviderId, string> = {
  openrouter: "https://openrouter.ai/api/v1/auth/key",
  openai: "https://api.openai.com/v1/models",
};

export type VerifyKeyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unreachable" }
  /** Prefixo da chave é de outro provedor: nada é enviado a ninguém. */
  | { ok: false; reason: "wrong_provider"; provider: AiProviderId };

/**
 * Provedor que o prefixo da chave denuncia, quando ele é inequívoco: `sk-or-`
 * é OpenRouter; outro `sk-` é OpenAI. Sem prefixo conhecido, null.
 */
function providerByPrefix(apiKey: string): AiProviderId | null {
  const key = apiKey.trim();
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

/** Status que significam "o provedor recusou esta chave". */
function invalidStatuses(provider: AiProviderId): number[] {
  // OpenRouter: 401/403. OpenAI: só 401 é chave inválida.
  return provider === "openai" ? [401] : [401, 403];
}

/**
 * OpenAI 403 em /v1/models: a chave autenticou (senão seria 401), só não tem
 * permissão de listar modelos. Chave de projeto restrita a Chat Completions
 * cai aqui e funciona pra gerar texto, então guarda.
 */
function acceptedStatus(provider: AiProviderId, status: number): boolean {
  return provider === "openai" && status === 403;
}

export async function verifyAiKey(
  provider: AiProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<VerifyKeyResult> {
  // Chave de um provedor colada com o outro selecionado não sai daqui: senão a
  // chave válida da OpenRouter iria parar na OpenAI (e vice-versa).
  const byPrefix = providerByPrefix(apiKey);
  if (byPrefix && byPrefix !== provider) return { ok: false, reason: "wrong_provider", provider: byPrefix };

  let res: Response;
  try {
    res = await fetchImpl(KEY_ENDPOINTS[provider], {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (res.ok || acceptedStatus(provider, res.status)) return { ok: true };
  // Qualquer outro status é problema do lado do provedor, não da chave.
  return { ok: false, reason: invalidStatuses(provider).includes(res.status) ? "invalid" : "unreachable" };
}
