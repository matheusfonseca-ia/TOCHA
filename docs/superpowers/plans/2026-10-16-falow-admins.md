# Falow — admins, cortesia e bloqueio — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins definidos por variável de ambiente, com os poderes do dono e um painel `/admin` para cortesia, bloqueio, reenvio de convite e visão dos clientes, tudo auditado.

**Architecture:** `isAdmin` lê `FALOW_OWNER_USER_ID` + `FALOW_ADMIN_USER_IDS`. A regra única `hasActiveAccess` passa a considerar `access_grants` (bloqueio/cortesia) antes da assinatura; o middleware deixa de duplicar a regra e chama `hasActiveAccess`. O painel fica em `src/app/admin/**`, protegido no middleware (404), no layout e em cada server action por `requireAdmin()`; operações de escrita vivem em `src/lib/admin/*` com auditoria e reversão.

**Tech Stack:** Next.js 14 App Router · Supabase (Auth admin API, Postgres RLS) · Vitest · zod · shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-16-falow-admins-design.md`

Todos os caminhos são relativos a `projetos/falow/`, branch `multiusuario`. **Sem push, sem merge na main.** Neste shell `npm test` não funciona: testes com `node node_modules/vitest/vitest.mjs run [arquivo]`, typecheck com `node node_modules/typescript/bin/tsc --noEmit`. Baseline atual: 66 arquivos / 740 testes.

## Global Constraints

- Admin = dono (`FALOW_OWNER_USER_ID`) **ou** UUID em `FALOW_ADMIN_USER_IDS` (vírgulas; `trim`; item que não é UUID é descartado com `console.error`). Nada no app altera essa lista.
- Admin tem os poderes do dono: acesso sem pagar, sem limite de @, IA, nunca apagado pelo purge.
- Ordem da regra de acesso: admin → bloqueio (sem acesso) → cortesia com `expires_at > agora` → assinatura `active|trialing|past_due`. Erro de leitura = sem acesso + `console.error`.
- Admin não lê conversas/contatos/mensagens; não mexe na Stripe; admin não pode ser alvo de cortesia/bloqueio.
- Toda ação de escrita do admin grava `admin_audit_log`; se a auditoria falhar, a mudança é revertida e a ação devolve erro.
- `access_grants`: só `select` da própria linha pelo usuário; `admin_audit_log`: nenhuma policy. Escritas só com service role.
- Validação: `user_id` UUID; validade no futuro e até 5 anos; e-mail válido; motivo 1-200 caracteres.
- Textos em pt-BR, tom direto. Nenhum teste fala com rede.

## Review Focus

1. **Cliente bloqueado chamando server actions do painel normal** (ex.: enviar DM pelo CRM) → bloqueio precisa valer também fora do middleware: o bot e o cron usam `hasActiveAccess`, e o envio pelo composer usa o token via `getFreshToken` — o bloqueio corta o bot/cron (Task 2) e o painel (middleware, Task 3). Teste em Task 2 (bot/cron via `accountHasAccess`).
2. **Cortesia que vence no meio da sessão** → na próxima navegação o middleware manda para `/assinatura`. Teste em Task 3.
3. **Variável `FALOW_ADMIN_USER_IDS` com espaço, quebra de linha, item vazio ou e-mail no lugar do UUID** → só UUIDs válidos viram admin. Teste em Task 2.
4. **Admin tentando bloquear outro admin ou a si mesmo (inclusive chamando a action direto)** → recusado no servidor. Teste em Task 4.
5. **Falha ao gravar auditoria** → a mudança não fica sem registro (reverte). Teste em Task 4.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/0018_admin_access_grants.sql` (novo) | tabelas `access_grants` e `admin_audit_log` |
| `src/types/database.ts` | tipos `AccessGrant`, `AdminAuditEntry` |
| `src/lib/sequences/__tests__/fake-supabase.ts` | tabelas novas no fake |
| `scripts/check-db-schema.mjs`, `scripts/check-tenant-isolation.mjs` | exigir/testar as tabelas novas |
| `src/lib/billing/access.ts` | `adminIds`, `isAdmin`, `accessGrantOf`, regra nova em `hasActiveAccess` |
| `src/lib/billing/purge.ts` | nunca apagar admin nem quem tem acesso |
| `src/middleware.ts`, `src/lib/auth/routing.ts` | usar `hasActiveAccess`; `/admin` → 404 para não-admin |
| callers de `isOwner` (layout, ai-actions, callback OAuth, checkout, `/assinatura`) | passam a `isAdmin` |
| `src/lib/auth/invite.ts` (novo) | `findUserIdByEmail`, `inviteUser` (extraídos de `stripe-deps.ts`) |
| `src/lib/admin/require-admin.ts` (novo) | `requireAdmin()` |
| `src/lib/admin/grants.ts` (novo) | cortesia/bloqueio com auditoria e reversão |
| `src/lib/admin/customers.ts` (novo) | lista de clientes para o painel |
| `src/app/admin/**` (novo) | layout, páginas e `actions.ts` |
| `src/components/admin/*` (novo) | formulários/botões do painel |
| `src/lib/auth/__tests__/admin-actions.audit.test.ts` | manifesto + regra "requireAdmin primeiro" |
| `docs/operacao-saas.md`, `README.md`, `.env.example` | operação |

---

### Task 1: Banco — migration 0018, tipos, fake e scripts

**Files:**
- Create: `supabase/migrations/0018_admin_access_grants.sql`
- Modify: `src/types/database.ts` (fim), `src/lib/sequences/__tests__/fake-supabase.ts` (union `TableName` e objeto `tables`), `scripts/check-db-schema.mjs` (`requiredColumns`), `scripts/check-tenant-isolation.mjs` (lista de tabelas lidas por B)

**Interfaces:**
- Produces: tabelas `access_grants(user_id, kind, expires_at, reason, granted_by, created_at)` e `admin_audit_log(id, admin_id, action, target_user_id, details, created_at)`; tipos `AccessGrant`, `AdminAuditEntry`, `AdminAuditAction`; tabelas `"access_grants" | "admin_audit_log"` no fake.

- [ ] **Step 1: Migration**

```sql
-- ══════════════════════════════════════════════════════════════════════════
-- Falow: admins (cortesia e bloqueio) e auditoria das ações de admin.
--
-- `access_grants`: no máximo uma linha por usuário — cortesia (com validade)
-- ou bloqueio. O usuário só LÊ a própria linha (o middleware precisa); só o
-- servidor (service role) grava, depois de conferir que quem pediu é admin.
-- `admin_audit_log`: toda ação de escrita do painel /admin. Só service role.
-- Aditiva: pode ser aplicada antes do deploy, junto com a 0016.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.access_grants (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('courtesy', 'block')),
  expires_at timestamptz,
  reason     text not null check (length(reason) between 1 and 200),
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  check (kind <> 'courtesy' or expires_at is not null)
);

alter table public.access_grants enable row level security;

drop policy if exists "own access grant select" on public.access_grants;
create policy "own access grant select" on public.access_grants
  for select using (user_id = auth.uid());

create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  admin_id       uuid not null,
  action         text not null check (action in (
                   'courtesy_grant', 'courtesy_revoke', 'block', 'unblock',
                   'invite_resend', 'courtesy_invite')),
  target_user_id uuid,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- sem policy: só service role
```

- [ ] **Step 2: Tipos** — fim de `src/types/database.ts`:

```ts
/** Cortesia (com validade) ou bloqueio dado por um admin (migration 0018). */
export interface AccessGrant {
  user_id: string;
  kind: "courtesy" | "block";
  expires_at: string | null;
  reason: string;
  granted_by: string;
  created_at: string;
}

export type AdminAuditAction =
  | "courtesy_grant"
  | "courtesy_revoke"
  | "block"
  | "unblock"
  | "invite_resend"
  | "courtesy_invite";

export interface AdminAuditEntry {
  id: number;
  admin_id: string;
  action: AdminAuditAction;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 3: Fake** — acrescentar `| "access_grants" | "admin_audit_log"` ao union `TableName` e `access_grants: [], admin_audit_log: [],` ao objeto `tables` da classe `FakeSupabase`.

- [ ] **Step 4: Scripts** —
  - `check-db-schema.mjs`, em `requiredColumns`: `access_grants: ["user_id", "kind", "expires_at", "reason", "granted_by"], admin_audit_log: ["id", "admin_id", "action", "target_user_id", "details"],`
  - `check-tenant-isolation.mjs`: acrescentar `"access_grants", "admin_audit_log"` à lista de tabelas que B lê sem filtro (B não pode ver nenhuma linha). Conferir que o cabeçalho/contagem de tabelas do script e a frase "22 tabelas" em `docs/operacao-saas.md` (passo 15) passam a 24.

- [ ] **Step 5: Verificar** — suíte inteira e typecheck verdes; `node --check scripts/check-tenant-isolation.mjs`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0018_admin_access_grants.sql src/types/database.ts src/lib/sequences/__tests__/fake-supabase.ts scripts/check-db-schema.mjs scripts/check-tenant-isolation.mjs docs/operacao-saas.md
git commit -m "Banco dos admins: access_grants e admin_audit_log (0018)"
```

---

### Task 2: Regra de acesso com admins, cortesia e bloqueio (+ purge)

**Files:**
- Modify: `src/lib/billing/access.ts`, `src/lib/billing/purge.ts`
- Test: `src/lib/billing/access.test.ts`, `src/lib/billing/purge.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces:
  - `adminIds(): Set<string>` (dono + lista válida)
  - `isAdmin(userId: string | null | undefined): boolean`
  - `accessGrantOf(client: QueryClient, userId: string): Promise<{ grant: AccessGrant | null; error: boolean }>`
  - `hasActiveAccess(client, userId, now?: Date): Promise<boolean>` — regra nova (mesma assinatura + `now` opcional)
  - `isOwner` continua exportado e inalterado (o purge exige o dono).

- [ ] **Step 1: Testes novos em `access.test.ts`** (manter os existentes; `afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); })` já existe ou acrescentar)

```ts
const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";

describe("isAdmin", () => {
  it("dono é sempre admin", () => {
    expect(isAdmin("user-1")).toBe(true);
  });
  it("lê a lista com espaços, quebra de linha e itens vazios", () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", ` ${A1} ,\n${A2}\n,, `);
    expect(isAdmin(A1)).toBe(true);
    expect(isAdmin(A2)).toBe(true);
    expect(isAdmin("33333333-3333-4333-8333-333333333333")).toBe(false);
  });
  it("descarta item que não é UUID (ex.: e-mail) e registra", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FALOW_ADMIN_USER_IDS", `matheus@exemplo.com,${A1}`);
    expect(isAdmin("matheus@exemplo.com")).toBe(false);
    expect(isAdmin(A1)).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
  it("variável vazia = só o dono", () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", "");
    expect(isAdmin(A1)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe("hasActiveAccess com access_grants", () => {
  const NOW = new Date("2026-10-16T12:00:00Z");
  let db: FakeSupabase;
  beforeEach(() => { db = createFakeAdmin(); });

  it("admin da lista tem acesso sem assinatura", async () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", A1);
    expect(await hasActiveAccess(db.client, A1, NOW)).toBe(true);
  });
  it("bloqueio vence a assinatura ativa", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", status: "active" });
    db.tables.access_grants.push({ user_id: "c1", kind: "block", expires_at: null, reason: "abuso", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c1", NOW)).toBe(false);
  });
  it("bloqueio não vale contra admin", async () => {
    db.tables.access_grants.push({ user_id: "user-1", kind: "block", expires_at: null, reason: "x", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "user-1", NOW)).toBe(true);
  });
  it("cortesia válida dá acesso sem assinatura", async () => {
    db.tables.access_grants.push({ user_id: "c2", kind: "courtesy", expires_at: "2026-11-16T00:00:00Z", reason: "parceiro", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c2", NOW)).toBe(true);
  });
  it("cortesia vencida não dá acesso; cai para a assinatura", async () => {
    db.tables.access_grants.push({ user_id: "c3", kind: "courtesy", expires_at: "2026-10-01T00:00:00Z", reason: "x", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c3", NOW)).toBe(false);
    db.tables.subscriptions.push({ user_id: "c3", stripe_customer_id: "cus_3", status: "active" });
    expect(await hasActiveAccess(db.client, "c3", NOW)).toBe(true);
  });
  it("erro ao ler access_grants = sem acesso + log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      from: (table: string) =>
        table === "access_grants"
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }) }
          : db.client.from(table as never),
    };
    db.tables.subscriptions.push({ user_id: "c4", stripe_customer_id: "cus_4", status: "active" });
    expect(await hasActiveAccess(failing, "c4", NOW)).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("access_grants"), "boom");
  });
  it("accountHasAccess respeita o bloqueio (bot e cron param)", async () => {
    db.tables.ig_accounts.push({ id: "acc-c5", user_id: "c5", ig_user_id: "5", status: "active" });
    db.tables.subscriptions.push({ user_id: "c5", stripe_customer_id: "cus_5", status: "active" });
    db.tables.access_grants.push({ user_id: "c5", kind: "block", expires_at: null, reason: "x", granted_by: "user-1" });
    expect(await accountHasAccess(db.client, "acc-c5")).toBe(false);
  });
});
```

Importar `isAdmin` no topo do arquivo de teste junto com os outros nomes de `@/lib/billing/access`.

- [ ] **Step 2: Rodar** — `node node_modules/vitest/vitest.mjs run src/lib/billing/access.test.ts` → FAIL (`isAdmin` não existe / regra antiga).

- [ ] **Step 3: Implementar em `access.ts`** (acrescentar; manter `isOwner`, `isAccessStatus`, `ACCESS_STATUSES`, `QueryClient`)

```ts
import type { AccessGrant } from "@/types/database";

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
```

Trocar `hasActiveAccess` por:

```ts
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
  if (error) {
    console.error(`[access] falha ao ler subscriptions do usuário ${userId}:`, error.message);
    return false;
  }
  return isAccessStatus((data as { status?: string } | null)?.status);
}
```

Atualizar o comentário do topo do arquivo citando admins, cortesia e bloqueio.

- [ ] **Step 4: Rodar** — mesmo comando → PASS (os testes antigos também).

- [ ] **Step 5: Purge** — em `src/lib/billing/purge.ts`:
  - trocar `isOwner(row.user_id)` por `isAdmin(row.user_id)` na checagem por linha (o `.neq("user_id", owner)` continua);
  - logo depois da releitura (antes de listar contas/apagar), acrescentar: `if (await hasActiveAccess(deps.admin, row.user_id, now)) continue;` — cobre admin e cortesia válida (bloqueio + `canceled` segue para o purge normal);
  - imports: `isAdmin`, `hasActiveAccess`.

  Testes novos em `purge.test.ts`:

```ts
  it("não apaga admin da lista mesmo cancelado e vencido", async () => {
    const A1 = "11111111-1111-4111-8111-111111111111";
    vi.stubEnv("FALOW_ADMIN_USER_IDS", A1);
    db.tables.subscriptions.push({ user_id: A1, stripe_customer_id: "c9", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("não apaga quem tem cortesia válida", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    db.tables.access_grants.push({ user_id: "venceu", kind: "courtesy", expires_at: "2027-01-01T00:00:00Z", reason: "x", granted_by: "user-1" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.removeUploads).not.toHaveBeenCalled();
  });

  it("bloqueado com assinatura cancelada e vencida é apagado normalmente", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    db.tables.access_grants.push({ user_id: "venceu", kind: "block", expires_at: null, reason: "x", granted_by: "user-1" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: ["venceu"] });
  });
```

(Use os nomes de variáveis/fixtures já existentes no arquivo: `db`, `deps`, o usuário `venceu` com conta `acc-venceu`, `NOW`.)

- [ ] **Step 6: Rodar** — `node node_modules/vitest/vitest.mjs run src/lib/billing` → PASS; suíte inteira e typecheck verdes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/access.ts src/lib/billing/access.test.ts src/lib/billing/purge.ts src/lib/billing/purge.test.ts
git commit -m "Regra de acesso com admins, cortesia e bloqueio; purge nunca apaga admin nem cortesia valida"
```

---

### Task 3: Middleware, `/admin` 404 e callers de `isOwner`

**Files:**
- Modify: `src/middleware.ts`, `src/lib/auth/routing.ts`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/sidebar.tsx`, `src/app/(dashboard)/rules/ai-actions.ts`, `src/app/api/auth/meta/callback/route.ts`, `src/app/api/billing/checkout/route.ts`, `src/app/assinatura/page.tsx`
- Test: `src/middleware.test.ts`, `src/lib/auth/routing.test.ts`, `src/app/assinatura/page.test.ts`, testes existentes dos callers

**Interfaces:**
- Consumes: `isAdmin`, `hasActiveAccess`, `accessGrantOf` (Task 2).
- Produces: `isAdminPath(pathname: string): boolean` em `routing.ts`; prop `showAdmin?: boolean` no `Sidebar`.

- [ ] **Step 1: Testes do middleware** — em `src/middleware.test.ts`, o mock de `createServerClient` precisa responder também a `from("access_grants")` (devolver `{ data: state.grant ?? null, error: null }`; acrescentar `grant` ao `state`). Novos casos:

```ts
  it("não-admin em /admin recebe 404 (rewrite), sem redirecionar", async () => {
    state.user = { id: "u2" };
    state.sub = { status: "active" };
    const r = await middleware(req("/admin/clientes"));
    expect(r.headers.get("x-middleware-rewrite")).toContain("/404");
    expect(r.headers.get("location")).toBeNull();
  });

  it("anônimo em /admin vai para /login como qualquer área logada", async () => {
    const r = await middleware(req("/admin"));
    expect(location(r)?.pathname).toBe("/login");
  });

  it("admin (dono) entra em /admin", async () => {
    state.user = { id: "user-1" };
    expect(isNext(await middleware(req("/admin")))).toBe(true);
  });

  it("cliente bloqueado vai para /assinatura mesmo com assinatura ativa", async () => {
    state.user = { id: "u3" };
    state.sub = { status: "active" };
    state.grant = { user_id: "u3", kind: "block", expires_at: null };
    expect(location(await middleware(req("/dashboard")))?.pathname).toBe("/assinatura");
  });

  it("cortesia vencida vai para /assinatura; válida entra", async () => {
    state.user = { id: "u4" };
    state.grant = { user_id: "u4", kind: "courtesy", expires_at: "2000-01-01T00:00:00Z" };
    expect(location(await middleware(req("/dashboard")))?.pathname).toBe("/assinatura");
    state.grant = { user_id: "u4", kind: "courtesy", expires_at: "2999-01-01T00:00:00Z" };
    expect(isNext(await middleware(req("/dashboard")))).toBe(true);
  });
```

Em `routing.test.ts`: `isAdminPath("/admin")`, `isAdminPath("/admin/clientes")` → true; `isAdminPath("/administrativo")`, `isAdminPath("/dashboard")` → false.

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: `routing.ts`** — acrescentar:

```ts
/** Área do painel de admin: /admin e qualquer subrota. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
```

- [ ] **Step 4: `middleware.ts`** — trocar o bloco que calcula `hasAccess` por:

```ts
  // Regra única (admin → bloqueio → cortesia → assinatura); o client do usuário
  // lê só as próprias linhas de access_grants e subscriptions (RLS).
  const hasAccess = user ? await hasActiveAccess(supabase, user.id) : false;

  // /admin não existe para quem não é admin: 404, sem revelar a área.
  if (user && isAdminPath(pathname) && !isAdmin(user.id)) {
    const url = request.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }
```

Imports: `hasActiveAccess, isAdmin` de `@/lib/billing/access`; `isAdminPath` de `@/lib/auth/routing`; remover `isAccessStatus`/`isOwner` se ficarem sem uso. A ordem: `getUser()` → `hasAccess` → checagem de `/admin` → `routeFor` (anônimo em `/admin` continua indo para `/login` pelo `routeFor`).

- [ ] **Step 5: Callers** —
  - `(dashboard)/layout.tsx`: `const admin = isAdmin(user.id);` → `showBilling={!admin}` e nova prop `showAdmin={admin}`. Em `sidebar.tsx`, aceitar `showAdmin?: boolean` (default `false`) e, perto de "Minha assinatura", renderizar um `Link` para `/admin` com o texto "Admin", usando as mesmas classes dos outros itens de texto do sidebar.
  - `rules/ai-actions.ts`: `currentUserIsOwner` → usar `isAdmin` (renomear para `currentUserIsAdmin`; atualizar o comentário: "dono e admins").
  - `api/auth/meta/callback/route.ts`: `owner: isOwner(user.id)` → `owner: isAdmin(user.id)` (admin sem limite de @).
  - `api/billing/checkout/route.ts`: `owner: isOwner(user?.id)` → `owner: isAdmin(user?.id)`.
  - `assinatura/page.tsx`: `isOwner` → `isAdmin` no redirect para `/dashboard`; ler a cortesia/bloqueio com `accessGrantOf(supabase, user.id)` (erro → mesma tela neutra de erro que já existe); se `grant.kind === "block"`: mostrar "Conta bloqueada. Fale com o suporte." e SEM botão Reativar/Gerenciar (só Sair); se cortesia válida: mostrar "Cortesia válida até <strong>{formatPurgeDate(grant.expires_at)}</strong>" e o botão "Ir para o painel".
  - Ajustar os testes existentes desses callers se algum depender do nome antigo; acrescentar em `src/app/assinatura/page.test.ts` dois casos (bloqueado → contém "Conta bloqueada" e não contém "Reativar"; cortesia válida → contém "Cortesia válida até").
  - `grep -rn "isOwner" src --include=*.ts --include=*.tsx | grep -v "\.test\."` deve sobrar só em `access.ts` e `purge.ts`.

- [ ] **Step 6: Rodar** — testes tocados + suíte inteira + typecheck verdes.

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts src/lib/auth/routing.ts src/lib/auth/routing.test.ts "src/app/(dashboard)/layout.tsx" src/components/layout/sidebar.tsx "src/app/(dashboard)/rules/ai-actions.ts" "src/app/(dashboard)/rules/ai-actions.test.ts" src/app/api/auth/meta/callback/route.ts src/app/api/billing/checkout/route.ts src/app/api/billing/routes.test.ts src/app/assinatura/page.tsx src/app/assinatura/page.test.ts
git commit -m "Middleware usa a regra unica de acesso, /admin da 404 para nao-admin e admins valem como dono"
```

(Inclua no `git add` só os arquivos que de fato mudaram.)

---

### Task 4: Núcleo do admin — `requireAdmin`, convite compartilhado, cortesia/bloqueio com auditoria

**Files:**
- Create: `src/lib/admin/require-admin.ts`, `src/lib/auth/invite.ts`, `src/lib/admin/grants.ts`
- Modify: `src/lib/billing/stripe-deps.ts` (usar `invite.ts`)
- Test: `src/lib/admin/require-admin.test.ts`, `src/lib/admin/grants.test.ts`

**Interfaces:**
- Consumes: `isAdmin` (Task 2), tabelas (Task 1).
- Produces:
  - `class AdminRequiredError extends Error`; `requireAdmin(): Promise<{ adminId: string }>` (lança `AdminRequiredError` sem sessão ou não-admin)
  - `findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null>`; `inviteUser(admin: AdminClient, email: string): Promise<string>` (em `src/lib/auth/invite.ts`; `redirectTo` = `${NEXT_PUBLIC_APP_URL}/definir-senha`)
  - Em `src/lib/admin/grants.ts`:
    - `type GrantResult = { ok: true } | { ok: false; error: string }`
    - `grantCourtesy(admin, { adminId, targetUserId, expiresAt: Date, reason: string, now?: Date }): Promise<GrantResult>`
    - `revokeCourtesy(admin, { adminId, targetUserId }): Promise<GrantResult>`
    - `blockUser(admin, { adminId, targetUserId, reason }): Promise<GrantResult>`
    - `unblockUser(admin, { adminId, targetUserId }): Promise<GrantResult>`
    - `recordAudit(admin, entry: { adminId: string; action: AdminAuditAction; targetUserId: string | null; details?: Record<string, unknown> }): Promise<boolean>`
    - `ADMIN_TARGET_ERROR = "Admins não podem ser alterados pelo painel."`

- [ ] **Step 1: `require-admin.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { user: null as null | { id: string } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));

import { AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";

describe("requireAdmin", () => {
  it("sem sessão lança", async () => {
    state.user = null;
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminRequiredError);
  });
  it("cliente comum lança", async () => {
    state.user = { id: "cliente-1" };
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminRequiredError);
  });
  it("dono passa e devolve o id", async () => {
    state.user = { id: "user-1" };
    await expect(requireAdmin()).resolves.toEqual({ adminId: "user-1" });
  });
});
```

- [ ] **Step 2: `src/lib/admin/require-admin.ts`**

```ts
import { isAdmin } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

export class AdminRequiredError extends Error {
  constructor() {
    super("Acesso restrito a administradores.");
  }
}

/**
 * Primeira linha de TODA server action e página de /admin. Valida a sessão no
 * servidor (getUser revalida o JWT) e confere a lista de admins dos secrets.
 */
export async function requireAdmin(): Promise<{ adminId: string }> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.id)) throw new AdminRequiredError();
  return { adminId: user.id };
}
```

- [ ] **Step 3: `src/lib/auth/invite.ts`** (mover a lógica de `stripe-deps.ts`)

```ts
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Usuário do Auth pelo e-mail (RPC só do service_role, migration 0016). */
export async function findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("falow_user_id_by_email", { p_email: email });
  if (error) throw new Error(`falow_user_id_by_email: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Cria a conta e manda o e-mail de definir senha (template "Invite user"). */
export async function inviteUser(admin: AdminClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });
  if (error || !data.user) throw new Error(`convite falhou: ${error?.message ?? "sem usuário"}`);
  return data.user.id;
}
```

Em `stripe-deps.ts`: `findUserIdByEmail: (email) => findUserIdByEmail(admin, email)` e `inviteUser: (email) => inviteUser(admin, email)` (importados de `@/lib/auth/invite`). Comportamento idêntico.

- [ ] **Step 4: `grants.test.ts`** (fake DB; nenhuma rede)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { ADMIN_TARGET_ERROR, blockUser, grantCourtesy, revokeCourtesy, unblockUser } from "@/lib/admin/grants";

const NOW = new Date("2026-10-16T12:00:00Z");
const in30 = new Date("2026-11-15T12:00:00Z");

describe("grants", () => {
  let db: FakeSupabase;
  const admin = () => db.client as never;
  beforeEach(() => { db = createFakeAdmin(); vi.restoreAllMocks(); });

  it("cortesia grava a linha e a auditoria", async () => {
    const r = await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "parceiro", now: NOW });
    expect(r).toEqual({ ok: true });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c1", kind: "courtesy", expires_at: in30.toISOString(), reason: "parceiro", granted_by: "user-1" })]);
    expect(db.tables.admin_audit_log).toEqual([expect.objectContaining({ admin_id: "user-1", action: "courtesy_grant", target_user_id: "c1" })]);
  });

  it("recusa validade no passado, acima de 5 anos e motivo vazio/longo", async () => {
    expect((await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: new Date("2026-10-01"), reason: "x", now: NOW })).ok).toBe(false);
    expect((await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: new Date("2032-01-01"), reason: "x", now: NOW })).ok).toBe(false);
    expect((await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "", now: NOW })).ok).toBe(false);
    expect((await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "a".repeat(201), now: NOW })).ok).toBe(false);
    expect(db.tables.access_grants).toHaveLength(0);
    expect(db.tables.admin_audit_log).toHaveLength(0);
  });

  it("alvo admin (inclusive o próprio) é recusado sem gravar nada", async () => {
    expect(await blockUser(admin(), { adminId: "user-1", targetUserId: "user-1", reason: "x" })).toEqual({ ok: false, error: ADMIN_TARGET_ERROR });
    expect(await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "user-1", expiresAt: in30, reason: "x", now: NOW })).toEqual({ ok: false, error: ADMIN_TARGET_ERROR });
    expect(db.tables.access_grants).toHaveLength(0);
  });

  it("bloqueio substitui a cortesia; desbloqueio remove a linha", async () => {
    await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "x", now: NOW });
    await blockUser(admin(), { adminId: "user-1", targetUserId: "c1", reason: "abuso" });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c1", kind: "block", expires_at: null, reason: "abuso" })]);
    await unblockUser(admin(), { adminId: "user-1", targetUserId: "c1" });
    expect(db.tables.access_grants).toHaveLength(0);
    expect(db.tables.admin_audit_log.map((e) => e.action)).toEqual(["courtesy_grant", "block", "unblock"]);
  });

  it("remover cortesia só apaga se for cortesia (não desbloqueia)", async () => {
    await blockUser(admin(), { adminId: "user-1", targetUserId: "c1", reason: "abuso" });
    const r = await revokeCourtesy(admin(), { adminId: "user-1", targetUserId: "c1" });
    expect(r.ok).toBe(false);
    expect(db.tables.access_grants).toHaveLength(1);
  });

  it("falha na auditoria reverte a mudança e devolve erro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const real = db.client;
    const failingAudit = {
      ...real,
      from: (t: string) =>
        t === "admin_audit_log" ? { insert: async () => ({ data: null, error: { message: "boom" } }) } : real.from(t as never),
    };
    const r = await blockUser(failingAudit as never, { adminId: "user-1", targetUserId: "c1", reason: "abuso" });
    expect(r.ok).toBe(false);
    expect(db.tables.access_grants).toHaveLength(0);

    await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c2", expiresAt: in30, reason: "x", now: NOW });
    const r2 = await blockUser(failingAudit as never, { adminId: "user-1", targetUserId: "c2", reason: "abuso" });
    expect(r2.ok).toBe(false);
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c2", kind: "courtesy" })]);
  });
});
```

- [ ] **Step 5: Rodar** — `node node_modules/vitest/vitest.mjs run src/lib/admin` → FAIL.

- [ ] **Step 6: `src/lib/admin/grants.ts`**

```ts
import { isAdmin, type QueryClient } from "@/lib/billing/access";
import type { AccessGrant, AdminAuditAction } from "@/types/database";

/**
 * Cortesia e bloqueio. Chamado SÓ depois de requireAdmin(), com o client da
 * service role. Toda escrita grava a auditoria; se a auditoria falhar, a
 * mudança é revertida (nunca fica ação de admin sem registro).
 */

export type GrantResult = { ok: true } | { ok: false; error: string };

export const ADMIN_TARGET_ERROR = "Admins não podem ser alterados pelo painel.";
const MAX_FUTURE_MS = 5 * 366 * 86_400_000;

function badReason(reason: string): string | null {
  const r = reason.trim();
  return r.length >= 1 && r.length <= 200 ? null : "O motivo precisa ter de 1 a 200 caracteres.";
}

export async function recordAudit(
  admin: QueryClient,
  entry: { adminId: string; action: AdminAuditAction; targetUserId: string | null; details?: Record<string, unknown> }
): Promise<boolean> {
  const { error } = await admin.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    target_user_id: entry.targetUserId,
    details: entry.details ?? {},
  });
  if (error) console.error("[admin] falha ao gravar auditoria:", error.message);
  return !error;
}

async function currentGrant(admin: QueryClient, userId: string): Promise<{ grant: AccessGrant | null; error: string | null }> {
  const { data, error } = await admin.from("access_grants").select("*").eq("user_id", userId).maybeSingle();
  return { grant: (data as AccessGrant | null) ?? null, error: error ? error.message : null };
}

/** Volta access_grants do usuário ao estado anterior (linha antiga ou nenhuma). */
async function restore(admin: QueryClient, userId: string, previous: AccessGrant | null): Promise<void> {
  if (previous) await admin.from("access_grants").upsert(previous, { onConflict: "user_id" });
  else await admin.from("access_grants").delete().eq("user_id", userId);
}

async function writeWithAudit(
  admin: QueryClient,
  targetUserId: string,
  change: () => Promise<{ error: { message: string } | null }>,
  audit: { adminId: string; action: AdminAuditAction; details?: Record<string, unknown> }
): Promise<GrantResult> {
  if (isAdmin(targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };
  const { grant: previous, error: readError } = await currentGrant(admin, targetUserId);
  if (readError) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };

  const { error } = await change();
  if (error) return { ok: false, error: "Não foi possível salvar. Tente de novo." };

  const audited = await recordAudit(admin, { ...audit, targetUserId });
  if (!audited) {
    await restore(admin, targetUserId, previous);
    return { ok: false, error: "Não foi possível registrar a ação; nada foi alterado." };
  }
  return { ok: true };
}

export async function grantCourtesy(
  admin: QueryClient,
  input: { adminId: string; targetUserId: string; expiresAt: Date; reason: string; now?: Date }
): Promise<GrantResult> {
  const now = input.now ?? new Date();
  const expires = input.expiresAt.getTime();
  if (Number.isNaN(expires) || expires <= now.getTime() || expires > now.getTime() + MAX_FUTURE_MS) {
    return { ok: false, error: "A validade precisa ser uma data futura de até 5 anos." };
  }
  const reasonError = badReason(input.reason);
  if (reasonError) return { ok: false, error: reasonError };
  if (isAdmin(input.targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };

  return writeWithAudit(
    admin,
    input.targetUserId,
    () =>
      admin.from("access_grants").upsert(
        {
          user_id: input.targetUserId,
          kind: "courtesy",
          expires_at: input.expiresAt.toISOString(),
          reason: input.reason.trim(),
          granted_by: input.adminId,
        },
        { onConflict: "user_id" }
      ),
    { adminId: input.adminId, action: "courtesy_grant", details: { expires_at: input.expiresAt.toISOString(), reason: input.reason.trim() } }
  );
}

export async function revokeCourtesy(admin: QueryClient, input: { adminId: string; targetUserId: string }): Promise<GrantResult> {
  const { grant, error } = await currentGrant(admin, input.targetUserId);
  if (error) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };
  if (grant?.kind !== "courtesy") return { ok: false, error: "Este cliente não tem cortesia." };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () => admin.from("access_grants").delete().eq("user_id", input.targetUserId).eq("kind", "courtesy"),
    { adminId: input.adminId, action: "courtesy_revoke" }
  );
}

export async function blockUser(admin: QueryClient, input: { adminId: string; targetUserId: string; reason: string }): Promise<GrantResult> {
  if (isAdmin(input.targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };
  const reasonError = badReason(input.reason);
  if (reasonError) return { ok: false, error: reasonError };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () =>
      admin.from("access_grants").upsert(
        { user_id: input.targetUserId, kind: "block", expires_at: null, reason: input.reason.trim(), granted_by: input.adminId },
        { onConflict: "user_id" }
      ),
    { adminId: input.adminId, action: "block", details: { reason: input.reason.trim() } }
  );
}

export async function unblockUser(admin: QueryClient, input: { adminId: string; targetUserId: string }): Promise<GrantResult> {
  const { grant, error } = await currentGrant(admin, input.targetUserId);
  if (error) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };
  if (grant?.kind !== "block") return { ok: false, error: "Este cliente não está bloqueado." };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () => admin.from("access_grants").delete().eq("user_id", input.targetUserId).eq("kind", "block"),
    { adminId: input.adminId, action: "unblock" }
  );
}
```

Se o fake não suportar algum encadeamento usado (ex.: `.delete().eq().eq()`), ajuste o fake minimamente, não o código.

- [ ] **Step 7: Rodar** — `node node_modules/vitest/vitest.mjs run src/lib/admin src/lib/billing` → PASS; suíte inteira + typecheck.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin src/lib/auth/invite.ts src/lib/billing/stripe-deps.ts
git commit -m "Nucleo do admin: requireAdmin, convite compartilhado e cortesia/bloqueio com auditoria e reversao"
```

---

### Task 5: Painel `/admin` — lista de clientes, ações e auditoria

**Files:**
- Create: `src/lib/admin/customers.ts`, `src/lib/admin/customers.test.ts`, `src/lib/admin/access-email.ts`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/clientes/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/actions.test.ts`, `src/components/admin/customer-actions.tsx`, `src/components/admin/invite-courtesy-form.tsx`
- Modify: `src/lib/auth/__tests__/admin-actions.audit.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4), `grantCourtesy`/`revokeCourtesy`/`blockUser`/`unblockUser`/`recordAudit` (Task 4), `findUserIdByEmail`/`inviteUser` (Task 4), `isAdmin` (Task 2).
- Produces:
  - `listCustomers(admin, { search?: string; maxPages?: number }): Promise<{ customers: CustomerRow[]; truncated: boolean }>` com `CustomerRow = { userId: string; email: string; createdAt: string; lastSignInAt: string | null; isAdmin: boolean; igUsername: string | null; subscriptionStatus: string | null; currentPeriodEnd: string | null; purgeAfter: string | null; grant: { kind: "courtesy" | "block"; expiresAt: string | null; reason: string } | null }`
  - `resendAccessEmail(admin, { adminId, targetUserId }): Promise<GrantResult>` (convite se nunca entrou, senão recuperação de senha; grava `invite_resend`)
  - Server actions (`src/app/admin/actions.ts`, todas `"use server"`, todas começando com `const { adminId } = await requireAdmin();`): `grantCourtesyAction(formData)`, `revokeCourtesyAction(userId)`, `blockUserAction(formData)`, `unblockUserAction(userId)`, `resendAccessAction(userId)`, `inviteWithCourtesyAction(formData)` → todas devolvem `Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: `customers.ts` + teste** — `listCustomers` usa `admin.auth.admin.listUsers({ page, perPage: 200 })` página a página até `maxPages` (padrão 10; se parar por causa do limite, `truncated: true` e `console.warn`), filtra por e-mail (`includes`, sem diferenciar maiúscula) se houver `search`, e junta por `user_id` com `subscriptions` (`status, current_period_end, purge_after`), `ig_accounts` (`ig_username` onde `status = 'active'`) e `access_grants` (consultas com `.in("user_id", ids)` em lotes de até 200). **Não** lê nenhuma tabela de conversas/contatos/mensagens. Ordena por `createdAt` desc. Teste com um `admin` falso cujo `auth.admin.listUsers` devolve 3 usuários em 2 páginas e o fake DB com linhas nas três tabelas: confere a junção, a busca, o `isAdmin` (dono marcado) e `truncated` quando `maxPages` é atingido.

- [ ] **Step 2: `access-email.ts`** — `resendAccessEmail(admin, { adminId, targetUserId })`:
  - `isAdmin(targetUserId)` → `{ ok: false, error: ADMIN_TARGET_ERROR }`;
  - `admin.auth.admin.getUserById(targetUserId)` (erro/sem e-mail → erro amigável);
  - se `user.last_sign_in_at` for nulo → `admin.auth.admin.inviteUserByEmail(email, { redirectTo: <APP_URL>/definir-senha })`; senão → `admin.auth.resetPasswordForEmail(email, { redirectTo: <APP_URL>/definir-senha })`;
  - grava `recordAudit(..., action: "invite_resend", details: { mode: "invite" | "recovery" })` (aqui não há o que reverter: se a auditoria falhar, devolve erro dizendo que o e-mail saiu mas o registro falhou, e `console.error`).
  - Teste em `src/lib/admin/grants.test.ts` ou arquivo próprio com `admin.auth.admin` mockado: modo convite vs. recuperação, alvo admin recusado, auditoria gravada.

- [ ] **Step 3: `src/app/admin/actions.test.ts`** — mock de `@/lib/admin/require-admin` (estado: admin ou lança `AdminRequiredError`) e de `@/lib/supabase/admin` (fake DB + `auth.admin` mockado). Para CADA action: (a) quando `requireAdmin` lança → devolve `{ ok: false, error: "Acesso restrito a administradores." }` e o fake DB continua vazio (nenhuma escrita, nenhuma chamada ao `auth.admin`); (b) com admin → chama a função do núcleo e devolve o resultado; validação zod: `userId` não-UUID → erro sem tocar no banco; `inviteWithCourtesyAction` com e-mail inválido → erro; com e-mail existente (RPC devolve id) → só grava cortesia e audita `courtesy_invite`; com e-mail novo → convida e grava cortesia.

- [ ] **Step 4: `src/app/admin/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resendAccessEmail } from "@/lib/admin/access-email";
import { blockUser, grantCourtesy, recordAudit, revokeCourtesy, unblockUser, type GrantResult } from "@/lib/admin/grants";
import { AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";
import { findUserIdByEmail, inviteUser } from "@/lib/auth/invite";
import { isAdmin } from "@/lib/billing/access";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ações do painel /admin. TODA action começa com requireAdmin() — a trava de
 * auditoria (admin-actions.audit.test.ts) falha se uma delas não começar.
 */

const uuid = z.string().uuid("Cliente inválido.");
const reason = z.string().trim().min(1, "Informe o motivo.").max(200, "Motivo de até 200 caracteres.");
const date = z.coerce.date({ errorMap: () => ({ message: "Data inválida." }) });

async function guarded(run: (adminId: string) => Promise<GrantResult>): Promise<GrantResult> {
  let adminId: string;
  try {
    ({ adminId } = await requireAdmin());
  } catch (err) {
    if (err instanceof AdminRequiredError) return { ok: false, error: err.message };
    throw err;
  }
  const result = await run(adminId);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function grantCourtesyAction(formData: FormData): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = z.object({ userId: uuid, expiresAt: date, reason }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return grantCourtesy(createAdminClient(), { adminId, targetUserId: parsed.data.userId, expiresAt: parsed.data.expiresAt, reason: parsed.data.reason });
  });
}
```

…e no mesmo padrão `revokeCourtesyAction(userId: string)`, `blockUserAction(formData)` (`userId`, `reason`), `unblockUserAction(userId: string)`, `resendAccessAction(userId: string)` e `inviteWithCourtesyAction(formData)` (`email` via `z.string().trim().toLowerCase().email("E-mail inválido.")`, `expiresAt`, `reason`; resolve `findUserIdByEmail` → se existir e for admin, `ADMIN_TARGET_ERROR`; se não existir, `inviteUser`; então `grantCourtesy`; em caso de sucesso grava também `recordAudit(..., "courtesy_invite", { email, invited: <boolean> })`). Atenção: mesmo com `guarded`, a PRIMEIRA instrução de cada action exportada é `return guarded(...)` — a regra do teste de auditoria (Step 7) aceita `requireAdmin` direto ou `guarded` como primeira instrução.

- [ ] **Step 5: Páginas** —
  - `src/app/admin/layout.tsx`: server component; `try { await requireAdmin() } catch { notFound() }`; título "Admin", navegação "Clientes" / "Registro", link "Voltar ao painel" (`/dashboard`).
  - `src/app/admin/page.tsx`: últimas 50 linhas de `admin_audit_log` (service role, depois de `requireAdmin()`), com data (São Paulo), e-mail do admin e do alvo quando disponíveis (`auth.admin.getUserById`, com cache local por render), ação em português ("Cortesia dada", "Cortesia removida", "Bloqueio", "Desbloqueio", "E-mail de acesso reenviado", "Convite com cortesia") e detalhes (validade/motivo).
  - `src/app/admin/clientes/page.tsx`: `requireAdmin()`; `listCustomers(createAdminClient(), { search: searchParams.q })`; busca por e-mail (form GET `q`); tabela com as colunas da spec; aviso quando `truncated`; para cada linha não-admin, `<CustomerActions />`; admins aparecem com o selo "Admin" e sem ações. No topo, `<InviteCourtesyForm />`.
  - `src/components/admin/customer-actions.tsx` (`"use client"`): botões/diálogos "Dar cortesia" (validade 30/90/365 dias ou data + motivo), "Remover cortesia", "Bloquear" (motivo + aviso "Se o cliente paga, cancele também na Stripe."), "Desbloquear", "Reenviar acesso"; confirmação antes de bloquear/remover; `toast` com o resultado; usa as actions.
  - `src/components/admin/invite-courtesy-form.tsx` (`"use client"`): e-mail + validade + motivo → `inviteWithCourtesyAction`.
  - Reaproveitar `Dialog`, `Button`, `Input`, `Label`, `Select`, `Table`, `Badge` de `src/components/ui`. Datas formatadas com `formatPurgeDate`/fuso de São Paulo.

- [ ] **Step 6: Rodar** — testes de `src/lib/admin` e `src/app/admin` → PASS.

- [ ] **Step 7: Trava de auditoria** — em `src/lib/auth/__tests__/admin-actions.audit.test.ts`:
  - acrescentar ao manifesto as 6 actions de `app/admin/actions.ts` com a descrição `"requireAdmin"`;
  - acrescentar um teste: para todo arquivo `"use server"` sob `src/app/admin/`, cada `export async function` tem como PRIMEIRA instrução do corpo uma chamada a `requireAdmin(` ou `guarded(` (extraia o corpo com uma regex simples a partir de `export async function nome(...) {` até a primeira `;` e confira com `/^\s*(const\s*\{\s*adminId\s*\}\s*=\s*await\s+requireAdmin\(|return\s+guarded\()/`). Prove que é um gate real: remova temporariamente o `return guarded(` de uma action, veja o teste falhar, restaure.

- [ ] **Step 8: Verificar** — suíte inteira + typecheck. Não suba servidor de dev.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin src/app/admin src/components/admin src/lib/auth/__tests__/admin-actions.audit.test.ts
git commit -m "Painel /admin: clientes, cortesia, bloqueio, reenvio de acesso e registro de acoes"
```

---

### Task 6: Operação — runbook, README e `.env.example`

**Files:**
- Modify: `docs/operacao-saas.md`, `README.md`, `.env.example`

- [ ] **Step 1: Runbook** —
  - Passo 2 (0016): aplicar também `supabase/migrations/0018_admin_access_grants.sql` logo depois (aditiva; mesmo cuidado, com o SQL de desfazer: `drop table if exists public.admin_audit_log; drop table if exists public.access_grants;`).
  - Seção 4 (secrets): `FALOW_ADMIN_USER_IDS` — opcional; UUIDs (Supabase → Authentication → Users → copiar o UID), separados por vírgula, sem e-mails; o dono não precisa estar na lista; mudar a lista exige `npx wrangler secret put FALOW_ADMIN_USER_IDS` (vale na hora, sem novo deploy — confira) e nunca é feito pelo painel.
  - Nova seção 11 "Admins e painel /admin": quem é admin; o que o painel faz e não faz (não lê conversas; não mexe na Stripe — bloquear não cancela cobrança); recomendação de ligar MFA (TOTP) nas contas admin (Supabase → Authentication → MFA; cada admin cadastra no próprio login — confira o caminho); como remover um admin (tirar da variável); onde ver o registro (`/admin`) e consulta SQL do `admin_audit_log`.
  - Seção 10 (consulta mensal): incluir cortesias vencidas há mais de 30 dias (`select ... from access_grants where kind = 'courtesy' and expires_at < now() - interval '30 days'`).
  - Passo 16 (compra de teste): acrescentar o roteiro curto do admin: abrir `/admin` como dono; dar cortesia a um usuário de teste e ver que ele entra sem pagar; bloquear e ver que vai para `/assinatura` com "Conta bloqueada" e que o bot para; desbloquear; abrir `/admin` logado como cliente comum e ver a página 404.
- [ ] **Step 2: README e `.env.example`** — documentar `FALOW_ADMIN_USER_IDS` (bloco do dono) e o painel `/admin` em uma linha.
- [ ] **Step 3: Verificar** — suíte + typecheck (nada de código mudou) e `node --check scripts/check-tenant-isolation.mjs`.
- [ ] **Step 4: Commit**

```bash
git add docs/operacao-saas.md README.md .env.example
git commit -m "Runbook e docs dos admins: 0018, FALOW_ADMIN_USER_IDS, painel e MFA"
```
