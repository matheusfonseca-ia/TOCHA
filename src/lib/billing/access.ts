import type { AccessGrant } from "@/types/database";

/**
 * Regra única de acesso do Falow multiusuário (admins, bloqueio, cortesia e
 * assinatura, nesta ordem). Usada no middleware (painel),
 * no webhook da Meta (bot), no cron das sequências e no botão de IA.
 *
 * Sem import de client aqui: o middleware roda fora do contexto de Server
 * Component, então cada chamador passa o client que tem.
 */

export const ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryClient = { from: (table: any) => any };

export function isOwner(userId: string | null | undefined): boolean {
  // trim: `echo id | vercel env add` deixa quebra de linha no fim do valor, e o
  // purge usa este mesmo valor para decidir quem nunca pode ser apagado.
  const owner = process.env.FALOW_OWNER_USER_ID?.trim();
  return Boolean(owner && userId && userId === owner);
}

export function isAccessStatus(status: string | null | undefined): boolean {
  return (ACCESS_STATUSES as readonly string[]).includes(status ?? "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dono + `FALOW_ADMIN_USER_IDS` (UUIDs separados por vírgula). Lido a cada chamada. */
export function adminIds(): Set<string> {
  const ids = new Set<string>();
  const owner = process.env.FALOW_OWNER_USER_ID?.trim();
  if (owner) ids.add(owner);
  for (const raw of (process.env.FALOW_ADMIN_USER_IDS ?? "").split(",")) {
    const id = raw.trim();
    if (!id) continue;
    if (!UUID_RE.test(id)) {
      console.error(`[access] FALOW_ADMIN_USER_IDS tem um item que não é UUID e foi ignorado: "${id}"`);
      continue;
    }
    ids.add(id.toLowerCase());
  }
  return ids;
}

/** Admin = dono ou UUID listado. A lista vive só nos secrets do servidor. */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (isOwner(userId)) return true;
  return adminIds().has(userId.toLowerCase());
}

export async function accessGrantOf(
  client: QueryClient,
  userId: string
): Promise<{ grant: AccessGrant | null; error: boolean }> {
  const { data, error } = await client
    .from("access_grants")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`[access] falha ao ler access_grants do usuário ${userId}:`, error.message);
    return { grant: null, error: true };
  }
  return { grant: (data as AccessGrant | null) ?? null, error: false };
}

/**
 * Ordem: admin → bloqueio (sem acesso) → cortesia válida → assinatura.
 * Qualquer erro de leitura nega o acesso (com log).
 */
export async function hasActiveAccess(
  client: QueryClient,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  if (isAdmin(userId)) return true;

  const { grant, error: grantError } = await accessGrantOf(client, userId);
  if (grantError) return false;
  if (grant?.kind === "block") return false;
  if (grant?.kind === "courtesy" && grant.expires_at && new Date(grant.expires_at) > now) return true;

  const { data, error } = await client
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  // Continua fail-closed, mas o log diz que foi falha de leitura, não "sem assinatura".
  if (error) {
    console.error(`[access] falha ao ler subscriptions do usuário ${userId}:`, error.message);
    return false;
  }
  return isAccessStatus((data as { status?: string } | null)?.status);
}

export async function accountHasAccess(client: QueryClient, accountId: string): Promise<boolean> {
  const { data, error } = await client
    .from("ig_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error) {
    console.error(`[access] falha ao ler ig_accounts da conta ${accountId}:`, error.message);
    return false;
  }
  const userId = (data as { user_id?: string } | null)?.user_id;
  return userId ? hasActiveAccess(client, userId) : false;
}
