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

const BATCH = 200;
const CUSTOMER_PAGE_SIZE = 50;

export type CustomerPage = { customers: CustomerRow[]; page: number; totalPages: number; total: number };

type AuthUser = { id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null };

/** O SDK só expõe page/perPage; o endpoint do Auth também aceita filter/sort.
 * https://github.com/supabase/auth/blob/master/internal/api/admin.go
 * Executado exclusivamente no servidor, depois de requireAdmin(). */
async function authPage(page: number, search: string): Promise<{ users: AuthUser[]; total: number }> {
  const url = new URL("/auth/v1/admin/users", process.env.NEXT_PUBLIC_SUPABASE_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(CUSTOMER_PAGE_SIZE));
  url.searchParams.set("sort", "created_at desc");
  if (search) url.searchParams.set("filter", search);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`listUsers: HTTP ${response.status}`);
  const count = response.headers.get("x-total-count");
  const total = Number(count);
  const data = await response.json();
  if (count === null || !Number.isSafeInteger(total) || total < 0 || !Array.isArray(data.users)) {
    throw new Error("listUsers: resposta de paginação inválida");
  }
  return { users: data.users as AuthUser[], total };
}

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
  opts: { search?: string; page?: number } = {}
): Promise<CustomerPage> {
  const search = opts.search?.trim().toLowerCase() ?? "";
  const requestedPage = Number.isSafeInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  let { users: selected, total } = await authPage(requestedPage, search);
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage) ({ users: selected } = await authPage(page, search));
  const ids = selected.map((u) => u.id);
  if (ids.length === 0) return { customers: [], page, totalPages, total };

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

  const customers: CustomerRow[] = selected.map((u) => {
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

  return { customers, page, totalPages, total };
}
