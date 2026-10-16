import { isAdmin } from "@/lib/billing/access";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AccessGrant } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Lista de clientes do painel /admin. Chamado SÓ depois de requireAdmin(), com
 * o client da service role. Lê o Auth + subscriptions + ig_accounts (só o @
 * ativo) + access_grants; nunca conversas, contatos ou mensagens.
 */

export type CustomerRow = {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
  igUsername: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  purgeAfter: string | null;
  grant: { kind: "courtesy" | "block"; expiresAt: string | null; reason: string } | null;
};

const PER_PAGE = 200;
const BATCH = 200;
const DEFAULT_MAX_PAGES = 10;

type AuthUser = { id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null };

/** `select ... in (ids)` em lotes, para não estourar o tamanho da URL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectIn<T>(admin: AdminClient, table: string, columns: string, ids: string[], extra?: (q: any) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    let query = admin.from(table).select(columns).in("user_id", ids.slice(i, i + BATCH));
    if (extra) query = extra(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

export async function listCustomers(
  admin: AdminClient,
  opts: { search?: string; maxPages?: number } = {}
): Promise<{ customers: CustomerRow[]; truncated: boolean }> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const users: AuthUser[] = [];
  let truncated = false;

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const batch = (data?.users ?? []) as AuthUser[];
    users.push(...batch);
    const hasMore = batch.length > 0 && (data as { nextPage?: number | null }).nextPage != null;
    if (!hasMore) break;
    if (page >= maxPages) {
      truncated = true;
      console.warn(`[admin] lista de clientes cortada em ${maxPages} páginas (${users.length} usuários).`);
      break;
    }
  }

  const search = opts.search?.trim().toLowerCase();
  const filtered = search ? users.filter((u) => (u.email ?? "").toLowerCase().includes(search)) : users;
  const ids = filtered.map((u) => u.id);
  if (ids.length === 0) return { customers: [], truncated };

  const [subs, accounts, grants] = await Promise.all([
    selectIn<{ user_id: string; status: string; current_period_end: string | null; purge_after: string | null }>(
      admin,
      "subscriptions",
      "user_id, status, current_period_end, purge_after",
      ids
    ),
    selectIn<{ user_id: string; ig_username: string }>(admin, "ig_accounts", "user_id, ig_username", ids, (q) =>
      q.eq("status", "active")
    ),
    selectIn<Pick<AccessGrant, "user_id" | "kind" | "expires_at" | "reason">>(
      admin,
      "access_grants",
      "user_id, kind, expires_at, reason",
      ids
    ),
  ]);

  const subBy = new Map(subs.map((s) => [s.user_id, s]));
  const igBy = new Map(accounts.map((a) => [a.user_id, a.ig_username]));
  const grantBy = new Map(grants.map((g) => [g.user_id, g]));

  const customers: CustomerRow[] = filtered.map((u) => {
    const sub = subBy.get(u.id);
    const grant = grantBy.get(u.id);
    return {
      userId: u.id,
      email: u.email ?? "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      isAdmin: isAdmin(u.id),
      igUsername: igBy.get(u.id) ?? null,
      subscriptionStatus: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      purgeAfter: sub?.purge_after ?? null,
      grant: grant ? { kind: grant.kind, expiresAt: grant.expires_at, reason: grant.reason } : null,
    };
  });

  customers.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { customers, truncated };
}
