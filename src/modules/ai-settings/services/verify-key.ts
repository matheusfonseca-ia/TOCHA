/**
 * Confere a chave na OpenRouter antes de guardar, pra o erro de digitação
 * aparecer na hora e não só na primeira vez que alguém clica em ✨.
 * `/auth/key` não gasta crédito: só diz se a chave existe.
 */

const KEY_ENDPOINT = "https://openrouter.ai/api/v1/auth/key";

export type VerifyKeyResult = { ok: true } | { ok: false; reason: "invalid" | "unreachable" };

export async function verifyOpenRouterKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<VerifyKeyResult> {
  let res: Response;
  try {
    res = await fetchImpl(KEY_ENDPOINT, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (res.ok) return { ok: true };
  // 401/403: a OpenRouter recusou a chave. Qualquer outro status é problema
  // do lado deles, não da chave.
  return { ok: false, reason: res.status === 401 || res.status === 403 ? "invalid" : "unreachable" };
}
