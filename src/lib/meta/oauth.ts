/** Fluxo OAuth do Meta (Facebook Login for Business) para conectar contas IG. */

const VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

const SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "business_management",
].join(",");

export function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/meta/callback`;
}

export function getOAuthDialogUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${params}`;
}

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Graph API respondeu ${res.status}`);
  }
  return json;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: getRedirectUri(),
    code,
  });
  const json = await graphGet<{ access_token: string }>(
    `${GRAPH}/oauth/access_token?${params}`
  );
  return json.access_token;
}

export async function getLongLivedToken(
  shortToken: string
): Promise<{ token: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const json = await graphGet<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?${params}`
  );
  return { token: json.access_token, expiresIn: json.expires_in ?? null };
}

export interface PageWithInstagram {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username: string;
    profile_picture_url?: string;
  };
}

/** Páginas do usuário que possuem conta IG Business vinculada. */
export async function getPagesWithInstagram(
  userToken: string
): Promise<PageWithInstagram[]> {
  const params = new URLSearchParams({
    fields:
      "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
    limit: "50",
    access_token: userToken,
  });
  const json = await graphGet<{ data: PageWithInstagram[] }>(
    `${GRAPH}/me/accounts?${params}`
  );
  return (json.data ?? []).filter((p) => p.instagram_business_account);
}
