/**
 * Botões da mensagem do portão "Seguir para liberar": um link para o perfil
 * da conta e o postback "Já segui", que carrega o id da automação até o
 * toque (evento messaging_postbacks).
 */

export const FOLLOW_CHECK_PAYLOAD_PREFIX = "falow:follow_check:";

export function followCheckPayload(ruleId: string): string {
  return `${FOLLOW_CHECK_PAYLOAD_PREFIX}${ruleId}`;
}

/** Id da automação do toque em "Já segui", ou null se o payload for de outro botão. */
export function parseFollowCheckPayload(payload: string): string | null {
  if (!payload.startsWith(FOLLOW_CHECK_PAYLOAD_PREFIX)) return null;
  const ruleId = payload.slice(FOLLOW_CHECK_PAYLOAD_PREFIX.length).trim();
  return ruleId || null;
}

/** Perfil da conta; no celular o link abre dentro do app do Instagram. */
export function profileUrl(username: string): string {
  const handle = username.trim().replace(/^@/, "");
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
}
