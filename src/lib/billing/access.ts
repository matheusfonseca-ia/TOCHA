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

/** Tolerância depois do fim do período antes de desconfiar de um status "com acesso" velho. */
const STALE_PERIOD_MS = 7 * 86_400_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryClient = { from: (table: any) => any };

/**
 * Dono normalizado: trim (`echo id | vercel env add` deixa quebra de linha no
 * fim) e minúsculas (UUID copiado em maiúsculas de algum cliente de banco).
 * O Supabase devolve UUIDs em minúsculas; o purge usa este mesmo valor para
 * decidir quem nunca pode ser apagado.
 */
function ownerId(): string {
  return process.env.FALOW_OWNER_USER_ID?.trim().toLowerCase() ?? "";
}

export function isOwner(userId: string | null | undefined): boolean {
  const owner = ownerId();
  return Boolean(owner && userId && userId.trim().toLowerCase() === owner);
}

export function isAccessStatus(status: string | null | undefined): boolean {
  return (ACCESS_STATUSES as readonly string[]).includes(status ?? "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedAdminConfig: string | undefined;
let cachedAdminIds = new Set<string>();

/** Revalida a configuração quando muda; avisa sobre itens inválidos uma vez por configuração/processo. */
export function adminIds(): Set<string> {
  const config = JSON.stringify([process.env.FALOW_OWNER_USER_ID, process.env.FALOW_ADMIN_USER_IDS]);
  if (config === cachedAdminConfig) return new Set(cachedAdminIds);
  const ids = new Set<string>();
  const owner = ownerId();
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
  cachedAdminConfig = config;
  cachedAdminIds = ids;
  return new Set(ids);
}

/** Admin = dono ou UUID listado. A lista vive só nos secrets do servidor. */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (isOwner(userId)) return true;
  return adminIds().has(userId.trim().toLowerCase());
}

export async function accessGrantOf(
  client: QueryClient,
  userId: string
): Promise<{ grant: AccessGrant | null; error: boolean }> {
  const { data, error } = await client
    .from("access_grants")
    // Colunas explícitas: o client do usuário não lê reason/granted_by
    // (migration 0024 revoga o SELECT dessas colunas para authenticated).
    .select("user_id, kind, expires_at, created_at")
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
/** Cortesia que ainda vale: sem prazo (`expires_at` nulo) ou com prazo no futuro. */
export function isCourtesyValid(
  grant: Pick<AccessGrant, "kind" | "expires_at"> | null | undefined,
  now: Date = new Date()
): boolean {
  if (grant?.kind !== "courtesy") return false;
  return !grant.expires_at || new Date(grant.expires_at) > now;
}

export async function hasActiveAccess(
  client: QueryClient,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  if (isAdmin(userId)) return true;

  // As duas leituras em paralelo (uma ida e volta a menos em toda navegação
  // do middleware); a ordem da decisão continua a mesma.
  const [{ grant, error: grantError }, subscription] = await Promise.all([
    accessGrantOf(client, userId),
    client.from("subscriptions").select("status, current_period_end").eq("user_id", userId).maybeSingle() as Promise<{
      data: { status?: string; current_period_end?: string | null } | null;
      error: { message: string } | null;
    }>,
  ]);
  if (grantError) return false;
  if (grant?.kind === "block") return false;
  if (isCourtesyValid(grant, now)) return true;

  const { data, error } = subscription;
  // Continua fail-closed, mas o log diz que foi falha de leitura, não "sem assinatura".
  if (error) {
    console.error(`[access] falha ao ler subscriptions do usuário ${userId}:`, error.message);
    return false;
  }
  if (!isAccessStatus(data?.status)) return false;
  // Status com acesso mas período vencido há mais de 7 dias: o webhook da
  // Stripe não chegou (ou se perdeu). Fecha e registra; sem data, segue o status.
  const periodEnd = data?.current_period_end ? new Date(data.current_period_end).getTime() : NaN;
  if (Number.isFinite(periodEnd) && periodEnd < now.getTime() - STALE_PERIOD_MS) {
    console.error(
      `[access] assinatura do usuário ${userId} com status ${data?.status} e período vencido em ${data?.current_period_end}: acesso negado`
    );
    return false;
  }
  return true;
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
