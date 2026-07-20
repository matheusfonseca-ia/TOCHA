/**
 * Fluxo OAuth "Login do Instagram para empresas"
 * (Instagram API with Instagram Login — graph.instagram.com).
 *
 * Diferente do caminho antigo via Facebook, este funciona para a própria
 * conta sem App Review: basta a conta ser testadora do app e o app estar
 * em modo Live. O token é da conta profissional (não de Página) e expira
 * em ~60 dias — renovado automaticamente em process.ts.
 */

const VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const GRAPH = `https://graph.instagram.com/${VERSION}`;

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;
}

export function getOAuthDialogUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params}`;
}

async function igFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
    error_message?: string;
  };
  if (!res.ok || json.error || json.error_message) {
    throw new Error(
      json.error?.message ??
        json.error_message ??
        `API do Instagram respondeu ${res.status}`
    );
  }
  return json;
}

interface ShortLivedToken {
  token: string;
  igUserId: string;
}

/** code → token curto. A resposta vem embrulhada em `data[0]`. */
export async function exchangeCodeForToken(
  code: string
): Promise<ShortLivedToken> {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });

  type TokenPayload = { access_token: string; user_id: number | string };
  const json = await igFetch<TokenPayload & { data?: TokenPayload[] }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body }
  );

  const payload = json.data?.[0] ?? json;
  if (!payload.access_token) {
    throw new Error("Resposta do Instagram sem access_token.");
  }
  return { token: payload.access_token, igUserId: String(payload.user_id) };
}

/** Token curto → token longo (~60 dias). */
export async function getLongLivedToken(
  shortToken: string
): Promise<{ token: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    access_token: shortToken,
  });
  const json = await igFetch<{ access_token: string; expires_in?: number }>(
    `https://graph.instagram.com/access_token?${params}`
  );
  return { token: json.access_token, expiresIn: json.expires_in ?? null };
}

/**
 * Renova um token longo por mais ~60 dias.
 * Só funciona com tokens válidos e com mais de 24h de vida.
 */
export async function refreshLongLivedToken(
  token: string
): Promise<{ token: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  const json = await igFetch<{ access_token: string; expires_in?: number }>(
    `https://graph.instagram.com/refresh_access_token?${params}`
  );
  return { token: json.access_token, expiresIn: json.expires_in ?? null };
}

export interface InstagramProfile {
  igUserId: string;
  username: string;
  profilePictureUrl: string | null;
}

/** Perfil da conta profissional dona do token. */
export async function getInstagramProfile(
  token: string
): Promise<InstagramProfile> {
  const params = new URLSearchParams({
    fields: "user_id,username,profile_picture_url",
    access_token: token,
  });
  const json = await igFetch<{
    id?: string;
    user_id?: number | string;
    username: string;
    profile_picture_url?: string;
  }>(`${GRAPH}/me?${params}`);

  // user_id é o ID da conta profissional (o mesmo que chega nos webhooks);
  // id é o ID app-scoped — serve de fallback.
  const igUserId = json.user_id ?? json.id;
  if (!igUserId || !json.username) {
    throw new Error("Resposta do Instagram sem os dados do perfil.");
  }
  return {
    igUserId: String(igUserId),
    username: json.username,
    profilePictureUrl: json.profile_picture_url ?? null,
  };
}
