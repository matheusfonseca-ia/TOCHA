# Falow multiusuário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a instalação única do Falow em SaaS por assinatura (Stripe), com a conta do Matheus como dono, rodando na Cloudflare em `falow.app.br`.

**Architecture:** Webhook da Stripe numa rota do próprio app grava `subscriptions`; uma regra só (`hasActiveAccess`) decide acesso e é consultada em 4 portas (middleware, webhook da Meta, cron, IA). Conta nasce por convite do Supabase Auth; cadastro público fecha. Worker da Cloudflare ganha entrada própria com `scheduled()` para os crons.

**Tech Stack:** Next.js 14 (App Router) · Supabase (Auth + Postgres/RLS + Storage) · Stripe (`stripe` npm, Checkout, Customer Portal, webhooks) · OpenNext Cloudflare + Wrangler · Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-falow-multiusuario-design.md`

Todos os caminhos abaixo são relativos a `projetos/falow/`. Rodar comandos dentro dessa pasta. O repo tem git próprio (`matheusfonseca-ia/TOCHA`).

## Global Constraints

- Uma instalação só; mesmo repo, mesmo Supabase (`whpeabaruaipnijgjszy`), mesmo app Meta aprovado.
- Plano único: `STRIPE_PRICE_ID`; assinatura recorrente.
- Status com acesso: `active`, `trialing`, `past_due`. Qualquer outro (inclusive ausência de linha) = sem acesso.
- Dono = `FALOW_OWNER_USER_ID`: sempre com acesso, sem limite de @, único com IA, nunca apagado pelo purge.
- 1 conta de Instagram ativa por usuário (exceto dono); um `ig_user_id` ativo pertence a um usuário só.
- Exclusão: `purge_after = canceled_at + 30 dias`.
- Domínio: `https://falow.app.br`; remetente `nao-responda@falow.app.br`.
- Hospedagem: Cloudflare Workers (plano Workers Paid); nada de Vercel.
- Textos da UI em português do Brasil, tom direto.
- Nenhum teste fala com rede (o `vitest.setup.ts` derruba `fetch`); Stripe e Supabase sempre mockados.
- Migrations aplicadas no Supabase **antes** de publicar o código que as usa.

## Review Focus

1. **Compra repetida com o mesmo e-mail sem login** (pessoa já assinante compra de novo pela landing, ou terceiro que sabe o e-mail dela) → o handler NÃO religa a conta: a linha fica intacta, loga `compra repetida ignorada` com os ids das duas assinaturas e dos dois clientes (para cancelar/reembolsar a duplicada na mão) e responde `processed`. Teste na Task 3 (fix round 1).
2. **Logado com assinatura ativa clicando "Assinar/Reativar"** → não cria segunda assinatura; vai para `/dashboard`. Teste na Task 4.
3. **Leitor de link do e-mail (antivírus/Outlook) abrindo o convite** → o token não pode ser consumido no GET; `verifyOtp` só roda no envio do formulário. Teste na Task 5.
4. **Evento de assinatura antiga chegando depois da reativação** (`customer.subscription.deleted` da assinatura velha) → ignorado, não derruba a nova. Teste na Task 3.
5. **Conta reativada no mesmo dia do purge** → o purge confere o status de novo e não apaga quem tem acesso. Teste na Task 10.
6. **Cliente grava/altera `ig_accounts` direto pela API (chave anon + JWT dele) com o `ig_user_id` de outra pessoa** → recusado pelo RLS (Task 14 fecha a escrita; o script da Task 13 testa o ataque). Teste na Task 14.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0016_subscriptions.sql` (novo) | tabelas `subscriptions`, `stripe_events`, índice único de @, RPC por e-mail |
| `src/types/database.ts` | tipo `Subscription` |
| `src/lib/billing/access.ts` (novo) | `isOwner`, `isAccessStatus`, `hasActiveAccess`, `accountHasAccess` |
| `src/lib/billing/stripe.ts` (novo) | `getStripe()` (cliente com fetch) |
| `src/lib/billing/stripe-events.ts` (novo) | `handleStripeEvent` (puro, deps injetadas) |
| `src/lib/billing/stripe-deps.ts` (novo) | deps reais (Stripe + Supabase admin) |
| `src/app/api/webhooks/stripe/route.ts` (novo) | assinatura, idempotência, chama o handler |
| `src/app/api/billing/checkout/route.ts` (novo) | cria Checkout Session |
| `src/app/api/billing/portal/route.ts` (novo) | cria sessão do Customer Portal |
| `src/app/assinatura/page.tsx`, `src/app/assinatura/obrigado/page.tsx` (novos) | status/reativar e pós-compra |
| `src/lib/auth/routing.ts` (novo) | decisão pura do middleware |
| `src/middleware.ts` | aplica a decisão |
| `src/app/login/*`, `src/components/auth/login-form.tsx` | sem cadastro, com "esqueci a senha" |
| `src/app/definir-senha/*` (novo) | definir senha via `token_hash` |
| `src/lib/config.ts` (remover) | trava single-tenant |
| `src/lib/meta/served-account.ts` (novo) | conta ativa **e** com acesso, para o webhook |
| `src/lib/meta/process.ts`, `src/lib/sequences/runtime.ts` | portas 2 e 3 |
| `src/app/(dashboard)/rules/ai-actions.ts` | porta 4 |
| `src/lib/meta/connect-guard.ts` (novo) + callback OAuth | limite de 1 @ e @ duplicado; o upsert passa a usar o admin |
| `supabase/migrations/0017_ig_accounts_select_only.sql` (novo), `src/app/(dashboard)/accounts/actions.ts`, chamadas de `withSyncedProfiles` | Task 14: `ig_accounts` só leitura para o usuário |
| `src/lib/auth/ownership.ts` (novo) + 6 actions do CRM | helpers de posse |
| `src/lib/auth/__tests__/admin-actions.audit.test.ts` (novo) | trava de auditoria das actions com service role |
| `src/lib/billing/purge.ts` + `src/app/api/cron/purge/route.ts` (novos) | exclusão após 30 dias |
| `worker.ts` (novo), `wrangler.toml`, `package.json`, `vercel.json` (remover), `scripts/check-db-schema.mjs` | Cloudflare |
| `src/app/page.tsx`, `src/app/(legal)/*`, `README.md`, `.env.example` | textos |
| `docs/operacao-saas.md` (novo) | passo a passo manual (Stripe, Resend, Supabase, Meta, deploy) |

---

### Task 1: Banco — migration 0016, tipos, fake e checagem de schema

**Files:**
- Create: `supabase/migrations/0016_subscriptions.sql`
- Modify: `src/types/database.ts` (fim do arquivo)
- Modify: `src/lib/sequences/__tests__/fake-supabase.ts` (union `TableName` e objeto `tables`)
- Modify: `scripts/check-db-schema.mjs`
- Modify: `vitest.setup.ts`

**Interfaces:**
- Produces: tabela `subscriptions(user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, canceled_at, purge_after, updated_at)`; tabela `stripe_events(id, received_at)`; RPC `falow_user_id_by_email(p_email text) → uuid`; tipo `Subscription`; tabelas `"subscriptions" | "stripe_events"` no fake; env de teste `FALOW_OWNER_USER_ID="user-1"`.

- [ ] **Step 1: Escrever a migration**

```sql
-- ══════════════════════════════════════════════════════════════════════════
-- Falow: multiusuário (assinatura Stripe)
--
-- `subscriptions`: uma linha por usuário, espelho do status da Stripe. Só o
-- webhook da Stripe (service role) escreve; o dono da linha só lê.
-- `stripe_events`: idempotência do webhook (só service role).
-- Índice único de @ ativo: um ig_user_id ativo pertence a um usuário só
-- (o webhook da Meta acha a conta só pelo ig_user_id).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 text not null,
  current_period_end     timestamptz,
  canceled_at            timestamptz,
  purge_after            timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_purge_idx
  on public.subscriptions (purge_after) where purge_after is not null;

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription select" on public.subscriptions;
create policy "own subscription select" on public.subscriptions
  for select using (user_id = auth.uid());

create table if not exists public.stripe_events (
  id          text primary key,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- sem policy: só service role

-- O 0001 criou ig_accounts_ig_user_id_idx com a mesma expressão, mas sem
-- unique. "create unique index if not exists" com o mesmo nome não faria nada.
drop index if exists public.ig_accounts_ig_user_id_idx;
create unique index if not exists ig_accounts_active_ig_user_id_key
  on public.ig_accounts (ig_user_id) where status = 'active';

-- Achar usuário pelo e-mail da compra (supabase-js não tem getUserByEmail).
create or replace function public.falow_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

revoke all on function public.falow_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.falow_user_id_by_email(text) to service_role;
```

- [ ] **Step 2: Tipo `Subscription`** — acrescentar ao fim de `src/types/database.ts`:

```ts
/** Espelho da assinatura da Stripe (migration 0016). Só o webhook da Stripe escreve. */
export interface Subscription {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  purge_after: string | null;
  updated_at: string;
}
```

- [ ] **Step 3: Fake** — em `fake-supabase.ts`, acrescentar `| "subscriptions" | "stripe_events"` ao fim do union `TableName` e `subscriptions: [], stripe_events: [],` ao objeto `tables` da classe `FakeSupabase`.

- [ ] **Step 4: Dono nos testes existentes** — acrescentar ao fim de `vitest.setup.ts`:

```ts
/**
 * Os fixtures usam `user_id: "user-1"` (makeAccount). Marcá-lo como dono
 * mantém os testes antigos com acesso liberado sem precisar de assinatura;
 * testes de cobrança usam outros ids.
 */
process.env.FALOW_OWNER_USER_ID = "user-1";
```

- [ ] **Step 5: Checagem de schema** — em `scripts/check-db-schema.mjs`:
  - acrescentar em `requiredColumns`:
    ```js
    subscriptions: ["user_id", "stripe_customer_id", "stripe_subscription_id", "status", "current_period_end", "canceled_at", "purge_after"],
    stripe_events: ["id"],
    ```
  - trocar as mensagens: `"para validar o build da Vercel."` → `"para validar o build."`; `"O banco da Vercel não acompanha..."` → `"O banco não acompanha o código deste commit:"`; `"(0002 a 0013)"` → `"(até a 0016)"`; `"Banco compatível com o build da Vercel."` → `"Banco compatível com o build."`.

- [ ] **Step 6: Rodar a suíte** — `npm test` → tudo verde (nada de comportamento mudou). `npm run typecheck` → sem erro.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0016_subscriptions.sql src/types/database.ts src/lib/sequences/__tests__/fake-supabase.ts scripts/check-db-schema.mjs vitest.setup.ts
git commit -m "Banco do multiusuario: subscriptions, stripe_events e @ ativo unico"
```

> **Antes de aplicar no Supabase** (vai para `docs/operacao-saas.md`, Task 13): rodar
> `select ig_user_id, count(*) from public.ig_accounts where status = 'active' group by 1 having count(*) > 1;` — tem que voltar vazio.

---

### Task 2: Regra de acesso

**Files:**
- Create: `src/lib/billing/access.ts`
- Test: `src/lib/billing/access.test.ts`

**Interfaces:**
- Consumes: tabela `subscriptions`, `ig_accounts` (Task 1).
- Produces:
  - `ACCESS_STATUSES: readonly ["active","trialing","past_due"]`
  - `isOwner(userId: string | null | undefined): boolean`
  - `isAccessStatus(status: string | null | undefined): boolean`
  - `hasActiveAccess(client: QueryClient, userId: string): Promise<boolean>`
  - `accountHasAccess(client: QueryClient, accountId: string): Promise<boolean>`
  - `type QueryClient = { from: (table: any) => any }` (aceita client real, admin e fake)

- [ ] **Step 1: Teste**

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { accountHasAccess, hasActiveAccess, isAccessStatus, isOwner } from "@/lib/billing/access";

describe("regra de acesso", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
  });

  it("dono vem do FALOW_OWNER_USER_ID", () => {
    expect(isOwner("user-1")).toBe(true);
    expect(isOwner("cliente-1")).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("só active, trialing e past_due dão acesso", () => {
    for (const s of ["active", "trialing", "past_due"]) expect(isAccessStatus(s)).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "", null, undefined]) {
      expect(isAccessStatus(s)).toBe(false);
    }
  });

  it("cliente sem linha em subscriptions não tem acesso", async () => {
    expect(await hasActiveAccess(db.client, "cliente-1")).toBe(false);
  });

  it("cliente com assinatura ativa tem acesso; cancelada não", async () => {
    db.tables.subscriptions.push({ user_id: "cliente-1", stripe_customer_id: "cus_1", status: "active" });
    db.tables.subscriptions.push({ user_id: "cliente-2", stripe_customer_id: "cus_2", status: "canceled" });
    expect(await hasActiveAccess(db.client, "cliente-1")).toBe(true);
    expect(await hasActiveAccess(db.client, "cliente-2")).toBe(false);
  });

  it("dono tem acesso sem assinatura", async () => {
    expect(await hasActiveAccess(db.client, "user-1")).toBe(true);
  });

  it("accountHasAccess resolve o dono da conta do Instagram", async () => {
    db.tables.ig_accounts.push({ id: "acc-1", user_id: "cliente-1", ig_user_id: "1", status: "active" });
    db.tables.ig_accounts.push({ id: "acc-2", user_id: "cliente-2", ig_user_id: "2", status: "active" });
    db.tables.subscriptions.push({ user_id: "cliente-1", stripe_customer_id: "cus_1", status: "past_due" });
    expect(await accountHasAccess(db.client, "acc-1")).toBe(true);
    expect(await accountHasAccess(db.client, "acc-2")).toBe(false);
    expect(await accountHasAccess(db.client, "nao-existe")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar** — `npx vitest run src/lib/billing/access.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/billing/access.ts`**

```ts
/**
 * Regra única de acesso do Falow multiusuário. Usada no middleware (painel),
 * no webhook da Meta (bot), no cron das sequências e no botão de IA.
 *
 * Sem import de client aqui: o middleware roda fora do contexto de Server
 * Component, então cada chamador passa o client que tem.
 */

export const ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryClient = { from: (table: any) => any };

export function isOwner(userId: string | null | undefined): boolean {
  const owner = process.env.FALOW_OWNER_USER_ID;
  return Boolean(owner && userId && userId === owner);
}

export function isAccessStatus(status: string | null | undefined): boolean {
  return (ACCESS_STATUSES as readonly string[]).includes(status ?? "");
}

export async function hasActiveAccess(client: QueryClient, userId: string): Promise<boolean> {
  if (isOwner(userId)) return true;
  const { data } = await client
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return isAccessStatus((data as { status?: string } | null)?.status);
}

export async function accountHasAccess(client: QueryClient, accountId: string): Promise<boolean> {
  const { data } = await client
    .from("ig_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  const userId = (data as { user_id?: string } | null)?.user_id;
  return userId ? hasActiveAccess(client, userId) : false;
}
```

- [ ] **Step 4: Rodar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/access.ts src/lib/billing/access.test.ts
git commit -m "Regra de acesso por assinatura (dono sempre liberado)"
```

---

### Task 3: Webhook da Stripe

> **Emenda (fix round 1 — ver os `Ruling` R3-1/R3-2/R3-3 no ledger).** Os blocos de código e de teste abaixo são o desenho ORIGINAL; a versão entregue difere em três pontos, decididos depois da revisão do chefe: **(R3-1)** `created`/`updated` leem o estado atual com `retrieveSubscription` em vez de confiar no payload congelado do evento; `deleted` é final; evento de uma assinatura já `canceled` é ignorado; um helper `lifecyclePatch` define `canceled_at`/`purge_after` (reentrega não estende o prazo; status sem acesso não mexe no purge). **(R3-2)** o checkout NÃO religa a conta quando a linha já tem acesso com OUTRA assinatura (loga `compra repetida ignorada` e responde `processed`). **(R3-3)** o checkout usa o mesmo helper de ciclo de vida. O código e os testes finais estão em `src/lib/billing/stripe-events.ts` e `stripe-events.test.ts`.

**Files:**
- Modify: `package.json` (dependência `stripe`)
- Create: `src/lib/billing/stripe.ts`, `src/lib/billing/stripe-events.ts`, `src/lib/billing/stripe-deps.ts`, `src/app/api/webhooks/stripe/route.ts`
- Test: `src/lib/billing/stripe-events.test.ts`, `src/app/api/webhooks/stripe/route.test.ts`

**Interfaces:**
- Consumes: `isAccessStatus` (Task 2); tabelas e RPC da Task 1.
- Produces:
  - `getStripe(): Stripe`
  - `PURGE_AFTER_DAYS = 30`
  - `periodEndOf(sub: Stripe.Subscription): string | null`
  - `handleStripeEvent(event: Stripe.Event, deps: StripeEventDeps): Promise<StripeEventResult>`
  - `interface StripeEventDeps { admin: QueryClient; retrieveSubscription(id: string): Promise<Stripe.Subscription>; findUserIdByEmail(email: string): Promise<string | null>; inviteUser(email: string): Promise<string>; now?: () => Date }`
  - `type StripeEventResult = { status: "processed" | "ignored" } | { status: "retry"; reason: string }`
  - `stripeEventDeps(admin: ReturnType<typeof createAdminClient>): StripeEventDeps`
  - `POST /api/webhooks/stripe`

- [ ] **Step 1: Instalar** — `npm install stripe@^18` (adiciona em `dependencies`).

- [ ] **Step 2: Cliente — `src/lib/billing/stripe.ts`**

```ts
import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Cliente da Stripe. No Worker da Cloudflare não existe o módulo http do
 * Node: o fetch client é obrigatório.
 */
export function getStripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
    cached = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  }
  return cached;
}
```

- [ ] **Step 3: Teste do handler — `src/lib/billing/stripe-events.test.ts`**

```ts
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { handleStripeEvent, type StripeEventDeps } from "@/lib/billing/stripe-events";

const NOW = new Date("2026-10-15T12:00:00Z");
const PERIOD_END = 1_800_000_000; // segundos

function sub(id: string, status: Stripe.Subscription.Status, customer = "cus_1"): Stripe.Subscription {
  return {
    id,
    status,
    customer,
    items: { data: [{ current_period_end: PERIOD_END }] },
  } as unknown as Stripe.Subscription;
}

function evt(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${Math.random()}`, type, data: { object } } as unknown as Stripe.Event;
}

function checkout(overrides: Record<string, unknown> = {}) {
  return evt("checkout.session.completed", {
    mode: "subscription",
    customer: "cus_1",
    subscription: "sub_1",
    customer_details: { email: "Cliente@Exemplo.com" },
    ...overrides,
  });
}

describe("handleStripeEvent", () => {
  let db: FakeSupabase;
  let deps: StripeEventDeps;
  let subs: Record<string, Stripe.Subscription>;

  beforeEach(() => {
    db = createFakeAdmin();
    subs = { sub_1: sub("sub_1", "active") };
    deps = {
      admin: db.client,
      retrieveSubscription: vi.fn(async (id: string) => subs[id]),
      findUserIdByEmail: vi.fn(async () => null),
      inviteUser: vi.fn(async () => "novo-user"),
      now: () => NOW,
    };
  });

  it("checkout de e-mail novo convida e grava a assinatura", async () => {
    const result = await handleStripeEvent(checkout(), deps);
    expect(result).toEqual({ status: "processed" });
    expect(deps.inviteUser).toHaveBeenCalledWith("Cliente@Exemplo.com");
    expect(db.tables.subscriptions).toEqual([
      expect.objectContaining({
        user_id: "novo-user",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        status: "active",
        current_period_end: new Date(PERIOD_END * 1000).toISOString(),
        canceled_at: null,
        purge_after: null,
      }),
    ]);
  });

  it("checkout de e-mail existente reaproveita o usuário", async () => {
    deps.findUserIdByEmail = vi.fn(async () => "user-existente");
    await handleStripeEvent(checkout(), deps);
    expect(deps.inviteUser).not.toHaveBeenCalled();
    expect(db.tables.subscriptions[0].user_id).toBe("user-existente");
  });

  it("reativação pelo mesmo cliente acha o usuário pela linha e zera a exclusão", async () => {
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_velha",
      status: "canceled",
      canceled_at: "2026-10-01T00:00:00Z",
      purge_after: "2026-10-31T00:00:00Z",
    });
    subs.sub_2 = sub("sub_2", "active");
    await handleStripeEvent(checkout({ subscription: "sub_2" }), deps);
    expect(deps.findUserIdByEmail).not.toHaveBeenCalled();
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      user_id: "cliente-1",
      stripe_subscription_id: "sub_2",
      status: "active",
      canceled_at: null,
      purge_after: null,
    });
  });

  it("compra repetida de quem já tem assinatura ativa: fica a nova e avisa no log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_velho",
      stripe_subscription_id: "sub_velha",
      status: "active",
    });
    deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
    subs.sub_nova = sub("sub_nova", "active", "cus_novo");
    await handleStripeEvent(checkout({ customer: "cus_novo", subscription: "sub_nova" }), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({ stripe_subscription_id: "sub_nova", stripe_customer_id: "cus_novo" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("sub_velha"));
    errorSpy.mockRestore();
  });

  it("checkout sem e-mail pede reenvio", async () => {
    const result = await handleStripeEvent(checkout({ customer_details: null, customer_email: null }), deps);
    expect(result.status).toBe("retry");
  });

  it("checkout que não é de assinatura é ignorado", async () => {
    expect(await handleStripeEvent(checkout({ mode: "payment" }), deps)).toEqual({ status: "ignored" });
  });

  it("updated de cliente desconhecido pede reenvio (chegou antes do checkout)", async () => {
    const result = await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "active")), deps);
    expect(result.status).toBe("retry");
  });

  it("updated muda status e período", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "past_due")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({ status: "past_due", purge_after: null });
  });

  it("deleted marca cancelada e agenda exclusão para 30 dias", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    });
  });

  it("evento de assinatura antiga não derruba a nova", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_2", status: "active" });
    const result = await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(result).toEqual({ status: "ignored" });
    expect(db.tables.subscriptions[0].status).toBe("active");
  });

  it("tipo de evento desconhecido é ignorado", async () => {
    expect(await handleStripeEvent(evt("invoice.paid", {}), deps)).toEqual({ status: "ignored" });
  });
});
```

- [ ] **Step 4: Rodar** — `npx vitest run src/lib/billing/stripe-events.test.ts` → FAIL (módulo não existe).

- [ ] **Step 5: Implementar `src/lib/billing/stripe-events.ts`**

```ts
import type Stripe from "stripe";

import { isAccessStatus, type QueryClient } from "@/lib/billing/access";

/**
 * Tradução dos eventos da Stripe para a tabela `subscriptions`. Puro: Stripe
 * e Supabase Auth entram por `deps`, então o teste roda sem rede.
 *
 * A Stripe não garante ordem de entrega: evento de assinatura de cliente
 * ainda desconhecido devolve "retry" (a rota responde 500 e a Stripe reenvia).
 */

export const PURGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export interface StripeEventDeps {
  admin: QueryClient;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  findUserIdByEmail(email: string): Promise<string | null>;
  inviteUser(email: string): Promise<string>;
  now?: () => Date;
}

export type StripeEventResult =
  | { status: "processed" | "ignored" }
  | { status: "retry"; reason: string };

type Ref = string | { id: string } | null | undefined;

function idOf(ref: Ref): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** Na API 2025-03+ o período mora nos itens; versões antigas tinham no topo. */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { items?: { data?: { current_period_end?: number }[] } }).items?.data?.[0]
      ?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckout(event.data.object as Stripe.Checkout.Session, deps);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscription(
        event.data.object as Stripe.Subscription,
        event.type === "customer.subscription.deleted",
        deps
      );
    default:
      return { status: "ignored" };
  }
}

async function handleCheckout(
  session: Stripe.Checkout.Session,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  if (session.mode !== "subscription") return { status: "ignored" };

  const customerId = idOf(session.customer as Ref);
  const subscriptionId = idOf(session.subscription as Ref);
  if (!customerId || !subscriptionId) {
    return { status: "retry", reason: "sessão sem cliente ou assinatura" };
  }

  // Reativação: o cliente da Stripe já tem linha. Compra nova: pelo e-mail.
  const { data: byCustomer } = await deps.admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  let userId = (byCustomer as { user_id?: string } | null)?.user_id ?? null;

  if (!userId) {
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    if (!email) return { status: "retry", reason: "sessão sem e-mail" };
    userId = (await deps.findUserIdByEmail(email)) ?? (await deps.inviteUser(email));
  }

  const { data: previous } = await deps.admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  const prev = previous as { stripe_subscription_id?: string | null; status?: string } | null;
  if (prev?.stripe_subscription_id && prev.stripe_subscription_id !== subscriptionId && isAccessStatus(prev.status)) {
    console.error(
      `[stripe] usuário ${userId} comprou de novo com assinatura ativa: ${prev.stripe_subscription_id} substituída por ${subscriptionId}. Cancelar/reembolsar a antiga na Stripe.`
    );
  }

  const sub = await deps.retrieveSubscription(subscriptionId);
  const now = (deps.now ?? (() => new Date()))();
  const { error } = await deps.admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEndOf(sub),
      canceled_at: null,
      purge_after: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { status: "retry", reason: `upsert falhou: ${error.message}` };
  return { status: "processed" };
}

async function handleSubscription(
  sub: Stripe.Subscription,
  deleted: boolean,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  const customerId = idOf(sub.customer as Ref);
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const row = data as { user_id: string; stripe_subscription_id: string | null } | null;
  if (!row) return { status: "retry", reason: "cliente ainda desconhecido" };
  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) return { status: "ignored" };

  const now = (deps.now ?? (() => new Date()))();
  const status = deleted ? "canceled" : sub.status;
  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEndOf(sub),
    updated_at: now.toISOString(),
  };
  if (status === "canceled") {
    patch.canceled_at = now.toISOString();
    patch.purge_after = new Date(now.getTime() + PURGE_AFTER_DAYS * DAY_MS).toISOString();
  } else if (isAccessStatus(status)) {
    patch.canceled_at = null;
    patch.purge_after = null;
  }

  const { error } = await deps.admin.from("subscriptions").update(patch).eq("user_id", row.user_id);
  if (error) return { status: "retry", reason: `update falhou: ${error.message}` };
  return { status: "processed" };
}
```

- [ ] **Step 6: Rodar** — `npx vitest run src/lib/billing/stripe-events.test.ts` → PASS. Se o fake não suportar `upsert` com `onConflict: "user_id"` substituindo campos, ajustar o fake (não o handler) para fazer merge da linha existente pela coluna de conflito.

- [ ] **Step 7: Deps reais — `src/lib/billing/stripe-deps.ts`**

```ts
import type { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import type { StripeEventDeps } from "@/lib/billing/stripe-events";

type Admin = ReturnType<typeof createAdminClient>;

export function stripeEventDeps(admin: Admin): StripeEventDeps {
  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  return {
    admin,
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    async findUserIdByEmail(email) {
      const { data, error } = await admin.rpc("falow_user_id_by_email", { p_email: email });
      if (error) throw new Error(`falow_user_id_by_email: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async inviteUser(email) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/definir-senha`,
      });
      if (error || !data.user) throw new Error(`convite falhou: ${error?.message ?? "sem usuário"}`);
      return data.user.id;
    },
  };
}
```

- [ ] **Step 8: Teste da rota — `src/app/api/webhooks/stripe/route.test.ts`**

```ts
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state } = vi.hoisted(() => ({ state: { db: null as unknown, handle: vi.fn() } }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => (state.db as FakeSupabase).client }));
vi.mock("@/lib/billing/stripe-deps", () => ({ stripeEventDeps: () => ({}) }));
vi.mock("@/lib/billing/stripe-events", () => ({ handleStripeEvent: (...a: unknown[]) => state.handle(...a) }));

import { POST } from "@/app/api/webhooks/stripe/route";

const SECRET = "whsec_teste";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

function signed(body: string, signature?: string) {
  const header =
    signature ??
    Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return new NextRequest("https://falow.app.br/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": header },
  });
}

describe("POST /api/webhooks/stripe", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.db = db;
    state.handle = vi.fn(async () => ({ status: "processed" }));
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
  });

  it("recusa assinatura inválida", async () => {
    const res = await POST(signed(payload, "t=1,v1=errado"));
    expect(res.status).toBe(400);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it("processa e grava o evento uma vez só", async () => {
    expect((await POST(signed(payload))).status).toBe(200);
    expect((await POST(signed(payload))).status).toBe(200);
    expect(state.handle).toHaveBeenCalledTimes(1);
    expect(db.tables.stripe_events.map((e) => e.id)).toEqual(["evt_1"]);
  });

  it("retry responde 500 e não marca o evento", async () => {
    state.handle = vi.fn(async () => ({ status: "retry", reason: "x" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(signed(payload))).status).toBe(500);
    expect(db.tables.stripe_events).toHaveLength(0);
  });
});
```

- [ ] **Step 9: Rodar** — `npx vitest run src/app/api/webhooks/stripe/route.test.ts` → FAIL (rota não existe).

- [ ] **Step 10: Rota — `src/app/api/webhooks/stripe/route.ts`**

```ts
import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { stripeEventDeps } from "@/lib/billing/stripe-deps";
import { handleStripeEvent } from "@/lib/billing/stripe-events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Webhook da Stripe. Corpo cru + verificação assíncrona (Web Crypto): o
 * `constructEvent` síncrono não roda no Worker. Evento só é marcado em
 * `stripe_events` depois de processado; erro ou "retry" devolve 500 para a
 * Stripe reenviar.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET não configurado" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Assinatura ausente", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch {
    return new NextResponse("Assinatura inválida", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ duplicate: true });

  try {
    const result = await handleStripeEvent(event, stripeEventDeps(admin));
    if (result.status === "retry") {
      console.warn(`[stripe] ${event.type} ${event.id} adiado: ${result.reason}`);
      return NextResponse.json({ retry: result.reason }, { status: 500 });
    }
  } catch (err) {
    console.error(`[stripe] ${event.type} ${event.id} falhou:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }

  await admin.from("stripe_events").insert({ id: event.id });
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 11: Rodar** — `npx vitest run src/lib/billing src/app/api/webhooks/stripe` → PASS. `npm run typecheck` → sem erro.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/lib/billing src/app/api/webhooks/stripe
git commit -m "Webhook da Stripe: conta por convite e espelho da assinatura"
```

---

### Task 4: Checkout, portal e páginas de assinatura

**Files:**
- Create: `src/app/api/billing/checkout/route.ts`, `src/app/api/billing/portal/route.ts`, `src/app/assinatura/page.tsx`, `src/app/assinatura/obrigado/page.tsx`, `src/lib/billing/checkout.ts`
- Modify: `src/components/layout/sidebar.tsx` (botão "Minha assinatura"), `src/app/(dashboard)/layout.tsx` (passa `isOwner`)
- Test: `src/lib/billing/checkout.test.ts`

**Interfaces:**
- Consumes: `getStripe` (Task 3), `isOwner`, `isAccessStatus` (Task 2).
- Produces:
  - `checkoutDecision(input: { userId: string | null; owner: boolean; subscription: { status: string; stripe_customer_id: string } | null }): { kind: "dashboard" } | { kind: "checkout"; customer?: string }`
  - `POST /api/billing/checkout` (form, sem corpo) → 303 para a Stripe ou `/dashboard`
  - `POST /api/billing/portal` → 303 para o portal ou `/assinatura`
  - páginas `/assinatura` (logado) e `/assinatura/obrigado` (pública)

- [ ] **Step 1: Teste da decisão — `src/lib/billing/checkout.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { checkoutDecision } from "@/lib/billing/checkout";

describe("checkoutDecision", () => {
  it("visitante sem login vai para checkout novo", () => {
    expect(checkoutDecision({ userId: null, owner: false, subscription: null })).toEqual({ kind: "checkout" });
  });
  it("logado com assinatura ativa não compra de novo", () => {
    expect(
      checkoutDecision({ userId: "c1", owner: false, subscription: { status: "active", stripe_customer_id: "cus_1" } })
    ).toEqual({ kind: "dashboard" });
  });
  it("dono nunca vai para checkout", () => {
    expect(checkoutDecision({ userId: "user-1", owner: true, subscription: null })).toEqual({ kind: "dashboard" });
  });
  it("cancelado reativa com o mesmo cliente da Stripe", () => {
    expect(
      checkoutDecision({ userId: "c1", owner: false, subscription: { status: "canceled", stripe_customer_id: "cus_1" } })
    ).toEqual({ kind: "checkout", customer: "cus_1" });
  });
});
```

- [ ] **Step 2: Rodar** — `npx vitest run src/lib/billing/checkout.test.ts` → FAIL.

- [ ] **Step 3: `src/lib/billing/checkout.ts`**

```ts
import { isAccessStatus } from "@/lib/billing/access";

export type CheckoutDecision = { kind: "dashboard" } | { kind: "checkout"; customer?: string };

/** Quem já tem acesso não abre uma segunda assinatura; reativação reaproveita o cliente da Stripe. */
export function checkoutDecision(input: {
  userId: string | null;
  owner: boolean;
  subscription: { status: string; stripe_customer_id: string } | null;
}): CheckoutDecision {
  if (input.owner) return { kind: "dashboard" };
  if (input.subscription && isAccessStatus(input.subscription.status)) return { kind: "dashboard" };
  if (input.subscription) return { kind: "checkout", customer: input.subscription.stripe_customer_id };
  return { kind: "checkout" };
}
```

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Rota de checkout — `src/app/api/billing/checkout/route.ts`**

```ts
import { NextResponse } from "next/server";

import { isOwner } from "@/lib/billing/access";
import { checkoutDecision } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Botão "Assinar" (landing) e "Reativar" (/assinatura). */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subscription } = user
    ? await supabase
        .from("subscriptions")
        .select("status, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle<{ status: string; stripe_customer_id: string }>()
    : { data: null };

  const decision = checkoutDecision({ userId: user?.id ?? null, owner: isOwner(user?.id), subscription });
  if (decision.kind === "dashboard") return NextResponse.redirect(new URL("/dashboard", appUrl), 303);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${appUrl}/assinatura/obrigado`,
    cancel_url: user ? `${appUrl}/assinatura` : `${appUrl}/`,
    locale: "pt-BR",
    allow_promotion_codes: true,
    ...(decision.customer
      ? { customer: decision.customer }
      : user?.email
        ? { customer_email: user.email }
        : {}),
  });

  return NextResponse.redirect(session.url!, 303);
}
```

- [ ] **Step 6: Rota do portal — `src/app/api/billing/portal/route.ts`**

```ts
import { NextResponse } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Minha assinatura": cartão, notas e cancelamento ficam no portal da Stripe. */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl), 303);

  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle<{ stripe_customer_id: string }>();
  if (!data) return NextResponse.redirect(new URL("/assinatura", appUrl), 303);

  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  });
  return NextResponse.redirect(session.url, 303);
}
```

- [ ] **Step 7: `/assinatura/obrigado` — `src/app/assinatura/obrigado/page.tsx`**

```tsx
import Link from "next/link";

import { FalowMark } from "@/components/brand/falow-logo";

export const metadata = { title: "Assinatura confirmada · Falow" };

export default function ObrigadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md space-y-4 text-center">
        <FalowMark className="mx-auto h-10 w-10" />
        <h1 className="text-2xl font-semibold">Pagamento confirmado</h1>
        <p className="text-muted-foreground">
          Mandamos um e-mail para o endereço da compra com o link para você definir sua senha. Pode levar
          alguns minutos; confira também o spam.
        </p>
        <p className="text-sm text-muted-foreground">
          Já tem senha? <Link href="/login" className="underline">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
```

Conferir o nome do export em `src/components/brand/falow-logo.tsx` (`FalowMark` é usado em `login-form.tsx`, então existe) e as props que ele aceita; se não aceitar `className`, remover a prop.

- [ ] **Step 8: `/assinatura` — `src/app/assinatura/page.tsx`**

```tsx
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { isAccessStatus, isOwner } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinatura · Falow" };

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento pendente (a Stripe está tentando cobrar de novo)",
  canceled: "Cancelada",
  unpaid: "Não paga",
  incomplete: "Pagamento não concluído",
  incomplete_expired: "Pagamento expirado",
};

export default async function AssinaturaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isOwner(user.id)) redirect("/dashboard");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Subscription>();
  const active = isAccessStatus(sub?.status);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Sua assinatura</h1>
        <p>
          Status: <strong>{sub ? STATUS_LABEL[sub.status] ?? sub.status : "Sem assinatura"}</strong>
        </p>

        {!active && sub?.purge_after && (
          <p className="text-sm text-muted-foreground">
            O bot está pausado. Seus dados ficam guardados até{" "}
            <strong>{format(new Date(sub.purge_after), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</strong>. Reative
            antes disso e tudo volta como estava; depois dessa data eles são apagados.
          </p>
        )}

        {active ? (
          <div className="flex gap-2">
            <form action="/api/billing/portal" method="post">
              <Button type="submit" variant="outline">Gerenciar na Stripe</Button>
            </form>
            <Button asChild>
              <Link href="/dashboard">Ir para o painel</Link>
            </Button>
          </div>
        ) : (
          <form action="/api/billing/checkout" method="post">
            <Button type="submit" className="w-full">Reativar assinatura</Button>
          </form>
        )}

        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground underline">Sair</button>
        </form>
      </div>
    </main>
  );
}
```

Conferir que `Button` aceita `asChild` (shadcn padrão aceita) e que `signOut` em `src/app/login/actions.ts:68` não recebe argumentos.

- [ ] **Step 9: Botão no painel.** Em `src/app/(dashboard)/layout.tsx`, ler o usuário (já existe client de servidor ali ou criar com `createClient()` + `auth.getUser()`), calcular `const owner = isOwner(user?.id)` e passar `showBilling={!owner}` para `<Sidebar>`. Em `src/components/layout/sidebar.tsx`, aceitar a prop `showBilling?: boolean` e, perto do botão de sair, renderizar:

```tsx
{showBilling && (
  <form action="/api/billing/portal" method="post">
    <button type="submit" className="w-full text-left text-sm text-muted-foreground hover:text-foreground">
      Minha assinatura
    </button>
  </form>
)}
```

Usar as mesmas classes do item de sair que já existe no sidebar, se forem diferentes destas.

- [ ] **Step 10: Verificar** — `npm test` e `npm run typecheck` → verdes.

- [ ] **Step 11: Commit**

```bash
git add src/lib/billing/checkout.ts src/lib/billing/checkout.test.ts src/app/api/billing src/app/assinatura "src/app/(dashboard)/layout.tsx" src/components/layout/sidebar.tsx
git commit -m "Checkout, portal da Stripe e paginas de assinatura"
```

---

### Task 5: Login sem cadastro, definir senha e middleware

**Files:**
- Create: `src/lib/auth/routing.ts`, `src/lib/auth/routing.test.ts`, `src/app/definir-senha/page.tsx`, `src/app/definir-senha/actions.ts`, `src/app/definir-senha/set-password-form.tsx`, `src/app/definir-senha/actions.test.ts`
- Modify: `src/middleware.ts`, `src/app/login/actions.ts`, `src/app/login/page.tsx`, `src/components/auth/login-form.tsx`
- Delete: `src/lib/config.ts`

**Interfaces:**
- Consumes: `isOwner`, `isAccessStatus` (Task 2).
- Produces:
  - `PUBLIC_PATHS: Set<string>` (exportado de `routing.ts`)
  - `routeFor(pathname: string, ctx: { loggedIn: boolean; hasAccess: boolean }): "next" | "/login" | "/dashboard" | "/assinatura"`
  - `requestPasswordReset(formData: FormData): Promise<AuthResult>` (em `login/actions.ts`)
  - `setPassword(formData: FormData): Promise<{ error?: string }>` (em `definir-senha/actions.ts`)

- [ ] **Step 1: Teste do roteamento — `src/lib/auth/routing.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { routeFor } from "@/lib/auth/routing";

const anon = { loggedIn: false, hasAccess: false };
const lapsed = { loggedIn: true, hasAccess: false };
const paying = { loggedIn: true, hasAccess: true };

describe("routeFor", () => {
  it("páginas públicas abrem para qualquer um", () => {
    for (const p of ["/", "/privacidade", "/exclusao-de-dados", "/termos-de-servico", "/assinatura/obrigado", "/definir-senha"]) {
      expect(routeFor(p, anon)).toBe("next");
      expect(routeFor(p, lapsed)).toBe("next");
    }
  });
  it("sem login vai para /login", () => {
    expect(routeFor("/dashboard", anon)).toBe("/login");
    expect(routeFor("/assinatura", anon)).toBe("/login");
    expect(routeFor("/login", anon)).toBe("next");
  });
  it("logado sem acesso só vê /assinatura", () => {
    expect(routeFor("/dashboard", lapsed)).toBe("/assinatura");
    expect(routeFor("/crm/conversas", lapsed)).toBe("/assinatura");
    expect(routeFor("/assinatura", lapsed)).toBe("next");
    expect(routeFor("/login", lapsed)).toBe("/assinatura");
  });
  it("logado com acesso usa o painel", () => {
    expect(routeFor("/dashboard", paying)).toBe("next");
    expect(routeFor("/assinatura", paying)).toBe("next");
    expect(routeFor("/login", paying)).toBe("/dashboard");
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: `src/lib/auth/routing.ts`**

```ts
/**
 * Decisão pura do middleware. Públicas: landing, as três páginas legais
 * cadastradas na Meta, o pós-compra e o "definir senha" (quem chega pelo
 * e-mail ainda não tem sessão). `/assinatura` exige login mas não exige
 * acesso — é para lá que vai quem perdeu o acesso.
 */
export const PUBLIC_PATHS = new Set([
  "/",
  "/privacidade",
  "/exclusao-de-dados",
  "/termos-de-servico",
  "/assinatura/obrigado",
  "/definir-senha",
]);

const NO_ACCESS_ALLOWED = new Set(["/assinatura"]);

export type Route = "next" | "/login" | "/dashboard" | "/assinatura";

export function routeFor(pathname: string, ctx: { loggedIn: boolean; hasAccess: boolean }): Route {
  if (PUBLIC_PATHS.has(pathname)) return "next";
  if (!ctx.loggedIn) return pathname === "/login" ? "next" : "/login";
  if (pathname === "/login") return ctx.hasAccess ? "/dashboard" : "/assinatura";
  if (!ctx.hasAccess && !NO_ACCESS_ALLOWED.has(pathname)) return "/assinatura";
  return "next";
}
```

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Middleware.** Em `src/middleware.ts`:
  - apagar a constante `PUBLIC_PATHS` local e o comentário dela; importar `PUBLIC_PATHS, routeFor` de `@/lib/auth/routing` e `isAccessStatus, isOwner` de `@/lib/billing/access`;
  - manter o atalho do topo: `if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) return NextResponse.next();`
  - trocar os dois `if` finais (sem usuário / usuário em `/login`) por:

```ts
  let hasAccess = false;
  if (user) {
    if (isOwner(user.id)) {
      hasAccess = true;
    } else {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle<{ status: string }>();
      hasAccess = isAccessStatus(sub?.status);
    }
  }

  const target = routeFor(pathname, { loggedIn: Boolean(user), hasAccess });
  if (target !== "next") {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
```

- [ ] **Step 6: Teste do definir senha — `src/app/definir-senha/actions.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: { verifyOtp: vi.fn(), updateUser: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { setPassword } from "@/app/definir-senha/actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("setPassword", () => {
  beforeEach(() => {
    auth.verifyOtp = vi.fn(async () => ({ error: null }));
    auth.updateUser = vi.fn(async () => ({ error: null }));
  });

  it("valida o token só no envio e define a senha", async () => {
    await expect(
      setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "segredo123" }))
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "segredo123" });
  });

  it("recusa senhas diferentes sem gastar o token", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "outra1234" }));
    expect(r.error).toBeTruthy();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("recusa tipo de link desconhecido", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "magiclink", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toBeTruthy();
  });

  it("link vencido vira mensagem clara", async () => {
    auth.verifyOtp = vi.fn(async () => ({ error: { message: "Token has expired or is invalid" } }));
    const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Rodar** — FAIL.

- [ ] **Step 8: `src/app/definir-senha/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    token_hash: z.string().min(1, "Link inválido. Peça um novo."),
    type: z.enum(["invite", "recovery"], { errorMap: () => ({ message: "Link inválido. Peça um novo." }) }),
    password: z.string().min(8, "A senha precisa de ao menos 8 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não batem.", path: ["confirm"] });

/**
 * O token do e-mail só é validado aqui, no envio do formulário: antivírus e
 * leitores de e-mail abrem links sozinhos (GET) e gastariam o token se a
 * página validasse ao carregar.
 */
export async function setPassword(formData: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const supabase = createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: parsed.data.type,
    token_hash: parsed.data.token_hash,
  });
  if (otpError) {
    return { error: "O link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\" na tela de login." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível salvar a senha. Tente de novo." };

  redirect("/dashboard");
}
```

- [ ] **Step 9: Rodar** — PASS.

- [ ] **Step 10: Página e formulário.** `src/app/definir-senha/page.tsx`:

```tsx
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Definir senha · Falow" };

export default function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  return <SetPasswordForm tokenHash={searchParams.token_hash ?? ""} type={searchParams.type ?? ""} />;
}
```

`src/app/definir-senha/set-password-form.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setPassword } from "./actions";

export function SetPasswordForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await setPassword(formData);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Defina sua senha</h1>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repita a senha</Label>
          <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar e entrar"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 11: Login sem cadastro.**
  - `src/app/login/actions.ts`: apagar `signUp` inteiro e o import de `isSignupOpen`. Acrescentar:

```ts
export async function requestPasswordReset(formData: FormData): Promise<AuthResult> {
  const email = z.string().email("E-mail inválido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.errors[0].message };

  // Mesma resposta exista ou não a conta: não revela quem é cliente.
  await createClient().auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });
  return { message: "Se esse e-mail tiver conta, o link para redefinir a senha chega em alguns minutos." };
}
```

  - `src/app/login/page.tsx`: tirar o import de `isSignupOpen` e renderizar `<LoginForm />` sem props.
  - `src/components/auth/login-form.tsx`: remover a prop `signupEnabled`, as `Tabs` de criar conta e o import de `signUp`. O estado `mode` passa a ser `"signin" | "reset"`; em `handleSubmit`, `const action = mode === "signin" ? signIn : requestPasswordReset;`. No modo `reset` o formulário mostra só o campo de e-mail e o botão "Enviar link"; abaixo do botão de entrar, um `<button type="button" onClick={() => setMode("reset")}>Esqueci minha senha</button>` e, no modo reset, um "Voltar para o login" que volta para `signin`. Acrescentar abaixo do card: `Ainda não é assinante? <a href="/">Conheça o Falow</a>`. Remover imports de `Tabs*` se ficarem sem uso.
  - Apagar `src/lib/config.ts`. Rodar `grep -rn "isSignupOpen\|signUp\b" src` → nada.

- [ ] **Step 12: Verificar** — `npm test` e `npm run typecheck` → verdes.

- [ ] **Step 13: Commit**

```bash
git add -A src/lib/auth src/middleware.ts src/app/login src/app/definir-senha src/components/auth/login-form.tsx src/lib/config.ts
git commit -m "Login sem cadastro publico, definir senha por token e middleware por assinatura"
```

---

### Task 6: Bot e cron param sem acesso

**Files:**
- Create: `src/lib/meta/served-account.ts`
- Modify: `src/lib/meta/process.ts` (as 4 buscas de conta por `ig_user_id`: em `handleMessagingEvent` ~l.239, `processPostbackEvent` ~l.636, `processSequencePostbackEvent` ~l.795, `processCommentEvent` ~l.857)
- Modify: `src/lib/sequences/runtime.ts` (`processDueRuns`, ~l.653)
- Test: `src/lib/meta/served-account.test.ts`, acréscimos em `src/lib/meta/process.test.ts` e `src/lib/sequences/runtime.test.ts`

**Interfaces:**
- Consumes: `hasActiveAccess`, `accountHasAccess` (Task 2).
- Produces: `findServedAccount(admin: AdminClient, igUserId: string): Promise<IgAccount | null>`; constante `INACTIVE_RECHECK_MS = 60 * 60 * 1000` em `runtime.ts`.

- [ ] **Step 1: Teste — `src/lib/meta/served-account.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";

import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";
import { findServedAccount } from "@/lib/meta/served-account";

describe("findServedAccount", () => {
  it("devolve a conta ativa do dono", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "111" }));
    expect((await findServedAccount(db.client as never, "111"))?.ig_user_id).toBe("111");
  });

  it("conta de cliente sem assinatura não é atendida", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "222", user_id: "cliente-1" }));
    expect(await findServedAccount(db.client as never, "222")).toBeNull();
  });

  it("conta de cliente com assinatura ativa é atendida", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "333", user_id: "cliente-2" }));
    db.tables.subscriptions.push({ user_id: "cliente-2", stripe_customer_id: "cus_2", status: "active" });
    expect(await findServedAccount(db.client as never, "333")).not.toBeNull();
  });

  it("conta desconectada não é atendida", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "444", status: "disconnected" }));
    expect(await findServedAccount(db.client as never, "444")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: `src/lib/meta/served-account.ts`**

```ts
import { hasActiveAccess } from "@/lib/billing/access";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Conta que o bot deve atender: ativa **e** de um usuário com acesso
 * (assinatura em dia ou dono). Assinatura parada = bot calado, sem log em
 * `interactions` (o cliente não vê o painel enquanto isso).
 */
export async function findServedAccount(admin: AdminClient, igUserId: string): Promise<IgAccount | null> {
  if (!igUserId) return null;
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", igUserId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  if (!account) return null;
  if (!(await hasActiveAccess(admin, account.user_id))) {
    console.info(`[meta] @${account.ig_username} sem assinatura ativa: evento ignorado`);
    return null;
  }
  return account;
}
```

> Desvio consciente da spec: ela previa log `subscription_inactive` em `interactions`. Isso exigiria mudar o check constraint de `interactions.status` (0007) e o log nunca é visto (o painel fica trancado). Fica só `console.info`.

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Trocar as 4 buscas em `process.ts`.** Importar `findServedAccount`. Em cada uma das 4 funções, substituir o bloco

```ts
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", <ID>)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
```

por `const account = await findServedAccount(admin, <ID>);` mantendo o `<ID>` de cada lugar (`recipientId`, `igBusinessId`). Em `processPostbackEvent` a busca está dentro de um `Promise.all` com a rule: trocar o primeiro elemento por `findServedAccount(admin, recipientId).then((account) => ({ data: account }))`, para não mexer na desestruturação `[{ data: account }, { data: rule }]`.

- [ ] **Step 6: Teste no webhook** — em `src/lib/meta/process.test.ts`, dentro do `describe` principal, acrescentar (usar o mesmo helper de payload de DM que os testes vizinhos usam; o nome abaixo é o padrão do arquivo — se for outro, usar o que existir):

```ts
  it("cliente sem assinatura: o bot não responde", async () => {
    const account = makeAccount({ user_id: "cliente-sem-assinatura" });
    db.tables.ig_accounts.push(account);
    db.tables.rules.push(makeRule({ account_id: account.id, keyword: "preço" }));
    await processWebhookPayload(dmPayload(account.ig_user_id, "lead-1", "preço"));
    expect(sendRuleReplyMock).not.toHaveBeenCalled();
    expect(db.tables.interactions).toHaveLength(0);
  });
```

- [ ] **Step 7: Cron.** Em `src/lib/sequences/runtime.ts`, importar `accountHasAccess` de `@/lib/billing/access`, declarar perto de `TAKEOVER_RECHECK_MS`:

```ts
/** Assinatura parada: o atraso fica parado (não apaga) e é reconferido de hora em hora. */
const INACTIVE_RECHECK_MS = 60 * 60 * 1000;
```

e, no laço de `processDueRuns`, logo antes do `if (await isTakenOver(...))`:

```ts
    if (!(await accountHasAccess(admin, row.account_id))) {
      await admin
        .from("sequence_runs")
        .update({ next_run_at: new Date(Date.now() + INACTIVE_RECHECK_MS).toISOString() })
        .eq("id", row.id)
        .eq("status", "waiting_delay");
      continue;
    }
```

- [ ] **Step 8: Teste no cron** — em `src/lib/sequences/runtime.test.ts`, seguindo o padrão dos testes de `processDueRuns` com conversa assumida (procurar `TAKEOVER` ou `isTakenOver` no arquivo e copiar a montagem):

```ts
  it("processDueRuns adia o atraso de conta sem assinatura sem apagar", async () => {
    const account = makeAccount({ user_id: "cliente-sem-assinatura" });
    db.tables.ig_accounts.push(account);
    const sequence = makeSequence({ account_id: account.id });
    db.tables.sequences.push(sequence);
    const due = new Date(Date.now() - 1000).toISOString();
    db.tables.sequence_runs.push(
      row({ id: "run-1", sequence_id: sequence.id, account_id: account.id, ig_sender_id: "lead-1", status: "waiting_delay", next_run_at: due })
    );
    await processDueRuns(5);
    const run = db.tables.sequence_runs.find((r) => r.id === "run-1")!;
    expect(run.status).toBe("waiting_delay");
    expect(Date.parse(run.next_run_at)).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
  });
```

Ajustar a montagem do run (`row(...)`, campos obrigatórios de `sequence_runs`) ao que os testes vizinhos já fazem.

- [ ] **Step 9: Rodar** — `npm test` → tudo verde (os testes antigos passam porque `user-1` é dono pelo `vitest.setup.ts`).

- [ ] **Step 10: Commit**

```bash
git add src/lib/meta/served-account.ts src/lib/meta/served-account.test.ts src/lib/meta/process.ts src/lib/meta/process.test.ts src/lib/sequences/runtime.ts src/lib/sequences/runtime.test.ts
git commit -m "Bot e cron das sequencias param quando a assinatura para"
```

---

### Task 7: IA só para o dono

**Files:**
- Modify: `src/app/(dashboard)/rules/ai-actions.ts`
- Test: `src/app/(dashboard)/rules/ai-actions.test.ts`

**Interfaces:**
- Consumes: `isOwner` (Task 2).
- Produces: `isAiEnabled()` e `generateForField()` exigem chave **e** usuário dono.

- [ ] **Step 1: Teste**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { userId: "user-1" as string | null } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
  }),
}));
vi.mock("@/lib/ai/provider", () => ({
  aiConfigFromEnv: () => ({ apiKey: "k", model: "m" }),
  generateFieldSuggestions: vi.fn(async () => ({ suggestions: ["ok"] })),
}));

import { generateForField, isAiEnabled } from "@/app/(dashboard)/rules/ai-actions";

describe("IA nos campos", () => {
  beforeEach(() => {
    state.userId = "user-1";
  });

  it("liberada para o dono", async () => {
    expect(await isAiEnabled()).toBe(true);
    expect(await generateForField({ field: "public_reply" as never })).toEqual({ suggestions: ["ok"] });
  });

  it("bloqueada para cliente, inclusive chamando a action direto", async () => {
    state.userId = "cliente-1";
    expect(await isAiEnabled()).toBe(false);
    expect(await generateForField({ field: "public_reply" as never })).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Rodar** — FAIL no segundo caso.

- [ ] **Step 3: Implementar.** Em `ai-actions.ts`, importar `isOwner` de `@/lib/billing/access` e `createClient` de `@/lib/supabase/server`, acrescentar:

```ts
async function currentUserIsOwner(): Promise<boolean> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return isOwner(user?.id);
}
```

trocar `isAiEnabled` por `return aiConfigFromEnv() !== null && (await currentUserIsOwner());` e, no começo de `generateForField`, antes de ler a config:

```ts
  if (!(await currentUserIsOwner())) {
    return { error: "A escrita com IA não está disponível nesta conta." };
  }
```

Atualizar o comentário do topo do arquivo: "Só o dono da instalação (`FALOW_OWNER_USER_ID`) vê e usa o botão."

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/rules/ai-actions.ts" "src/app/(dashboard)/rules/ai-actions.test.ts"
git commit -m "Botao de IA so para o dono"
```

---

### Task 8: Limite de 1 @ e @ duplicado no OAuth

**Files:**
- Create: `src/lib/meta/connect-guard.ts`, `src/lib/meta/connect-guard.test.ts`
- Modify: `src/app/api/auth/meta/callback/route.ts`, `src/app/(dashboard)/accounts/page.tsx` (`ERROR_MESSAGES`)

**Interfaces:**
- Consumes: `isOwner` (Task 2); índice único da Task 1.
- Produces: `connectBlockReason(input: { userId: string; igUserId: string; owner: boolean; activeAccounts: { user_id: string; ig_user_id: string }[] }): "account_taken" | "account_limit" | null`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, it } from "vitest";

import { connectBlockReason } from "@/lib/meta/connect-guard";

const base = { userId: "c1", igUserId: "111", owner: false };

describe("connectBlockReason", () => {
  it("primeira conta conecta", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [] })).toBeNull();
  });
  it("reconectar o mesmo @ (renovar token) é liberado", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "c1", ig_user_id: "111" }] })).toBeNull();
  });
  it("segundo @ do cliente esbarra no limite", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "c1", ig_user_id: "999" }] })).toBe("account_limit");
  });
  it("@ já ligado em outro login é recusado", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "outro", ig_user_id: "111" }] })).toBe("account_taken");
  });
  it("dono não tem limite, mas também não pega @ de outro", () => {
    const owner = { userId: "user-1", igUserId: "111", owner: true };
    expect(connectBlockReason({ ...owner, activeAccounts: [{ user_id: "user-1", ig_user_id: "999" }] })).toBeNull();
    expect(connectBlockReason({ ...owner, activeAccounts: [{ user_id: "outro", ig_user_id: "111" }] })).toBe("account_taken");
  });
});
```

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: `src/lib/meta/connect-guard.ts`**

```ts
export const MAX_ACCOUNTS_PER_USER = 1;

/**
 * Decide se o usuário pode conectar este @. `activeAccounts` = contas ativas
 * com este ig_user_id **ou** deste usuário (uma consulta só no callback).
 */
export function connectBlockReason(input: {
  userId: string;
  igUserId: string;
  owner: boolean;
  activeAccounts: { user_id: string; ig_user_id: string }[];
}): "account_taken" | "account_limit" | null {
  if (input.activeAccounts.some((a) => a.ig_user_id === input.igUserId && a.user_id !== input.userId)) {
    return "account_taken";
  }
  if (input.owner) return null;
  const others = input.activeAccounts.filter((a) => a.user_id === input.userId && a.ig_user_id !== input.igUserId);
  return others.length >= MAX_ACCOUNTS_PER_USER ? "account_limit" : null;
}
```

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Callback.** Em `src/app/api/auth/meta/callback/route.ts`, importar `createAdminClient`, `isOwner` e `connectBlockReason`. Logo depois de `const profile = await getInstagramProfile(longToken);` e **antes** de `subscribeAccountToWebhooks`:

```ts
    const admin = createAdminClient();

    // O RLS só mostra as contas do próprio usuário; o @ de outro login só
    // aparece pela service role.
    const { data: activeAccounts } = await admin
      .from("ig_accounts")
      .select("user_id, ig_user_id")
      .eq("status", "active")
      .or(`ig_user_id.eq.${profile.igUserId},user_id.eq.${user.id}`);
    const blocked = connectBlockReason({
      userId: user.id,
      igUserId: profile.igUserId,
      owner: isOwner(user.id),
      activeAccounts: activeAccounts ?? [],
    });
    if (blocked) return redirectToAccounts(`error=${blocked}`);
```

O **upsert de `ig_accounts` passa a usar esse mesmo `admin`** (hoje é `supabase.from("ig_accounts").upsert(...)`, com o client do usuário): a Task 14 fecha a policy `own accounts` para só leitura (migration 0017), então o usuário deixa de escrever em `ig_accounts` pela API. O `user_id` gravado continua sendo o `user.id` da sessão validada por `supabase.auth.getUser()` no começo da rota. Troque o comentário `// RLS (with check user_id = auth.uid()) garante a posse da linha` por `// Escrita pela service role: o user_id vem da sessão validada acima (a policy de ig_accounts é só leitura, migration 0017).`

E, no tratamento do erro do upsert, antes do `return redirectToAccounts("error=unknown")`:

```ts
      // Corrida com outro login conectando o mesmo @ (índice único da 0016).
      if (error.code === "23505") return redirectToAccounts("error=account_taken");
```

`profile.igUserId` vem da Graph API (só dígitos), então interpolar no `.or` é seguro; se quiser garantia, validar com `/^\d+$/` e cair em `exchange_failed` se não bater.

- [ ] **Step 6: Mensagens.** Em `src/app/(dashboard)/accounts/page.tsx`, acrescentar ao `ERROR_MESSAGES`:

```ts
  account_limit: "Seu plano permite 1 conta do Instagram. Desconecte a atual para conectar outra.",
  account_taken: "Esse @ já está conectado em outra conta do Falow. Desconecte por lá primeiro.",
```

- [ ] **Step 7: Verificar** — `npm test`, `npm run typecheck` → verdes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/meta/connect-guard.ts src/lib/meta/connect-guard.test.ts src/app/api/auth/meta/callback/route.ts "src/app/(dashboard)/accounts/page.tsx"
git commit -m "Uma conta do Instagram por assinatura e @ unico entre logins"
```

---

### Task 9: Isolamento — helpers de posse e trava de auditoria

**Files:**
- Create: `src/lib/auth/ownership.ts`, `src/lib/auth/__tests__/admin-actions.audit.test.ts`
- Modify: `src/modules/crm/handoff/services/handoff.actions.ts`, `src/modules/crm/inbox/services/status.actions.ts`, `src/modules/crm/notes/services/notes.actions.ts`, `src/modules/crm/quick-replies/services/quick-replies.actions.ts`, `src/modules/crm/tags/services/contact-fields.actions.ts`, `src/modules/crm/tags/services/tags.actions.ts`, `src/modules/crm/pipeline/services/pipeline.actions.ts`, `src/app/(dashboard)/accounts/actions.ts` (já reescrita na Task 14)

**Interfaces:**
- Produces:
  - `ownedAccountId(accountId: string): Promise<string | null>`
  - `ownedConversationId(conversationId: string): Promise<string | null>`
  - Manifesto `ADMIN_ACTIONS` no teste de auditoria.

- [ ] **Step 1: `src/lib/auth/ownership.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

/**
 * Checagem de posse para server actions que escrevem com a service role.
 * Consulta com o client do usuário: o RLS só devolve a linha se ela for
 * dele. Nulo = não é dele (ou não existe) e a action não pode seguir.
 */
export async function ownedAccountId(accountId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("ig_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function ownedConversationId(conversationId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
```

- [ ] **Step 2: Trocar as cópias locais (comportamento idêntico).**
  - `handoff.actions.ts` e `status.actions.ts`: apagar a função local `ownConversationId` e importar `ownedConversationId as ownConversationId` de `@/lib/auth/ownership` (o resto do arquivo não muda). Se `createClient` ficar sem uso, remover o import.
  - `notes.actions.ts` e `quick-replies.actions.ts`: apagar a função local `ownAccountId` e importar `ownedAccountId as ownAccountId`. Manter `ownNoteAccountId` / `ownQuickReplyAccountId` (consultam tabelas próprias).
  - `contact-fields.actions.ts` e `tags.actions.ts`: manter o nome `assertOwnsAccount` e trocar o corpo por:
    ```ts
    async function assertOwnsAccount(accountId: string): Promise<{ error: string | null }> {
      return (await ownedAccountId(accountId)) ? { error: null } : { error: "Conta não encontrada." };
    }
    ```
    importando `ownedAccountId`; remover `createClient` se ficar sem uso.
  - `src/app/(dashboard)/accounts/actions.ts` (`disconnectAccount`, reescrita na Task 14): trocar a checagem de posse feita inline por `ownedAccountId(id)`, mantendo a escrita pelo admin e as mensagens de erro.

- [ ] **Step 3: Achado real da auditoria — etapa apontando para sequência de outro cliente.** Em `pipeline.actions.ts`, `updateStageAction` grava `on_enter_sequence_id` sem conferir posse. (O runtime já filtra por `account_id`, então não executa, mas a referência estrangeira não pode nem ser gravada.) Logo depois do `if (!stage) return ...`, acrescentar:

```ts
  if (patch.onEnterSequenceId) {
    const { data: sequence } = await supabase
      .from("sequences")
      .select("id")
      .eq("id", patch.onEnterSequenceId)
      .maybeSingle<{ id: string }>();
    if (!sequence) return { error: "Workflow não encontrado." };
  }
```

- [ ] **Step 4: Teste de auditoria — `src/lib/auth/__tests__/admin-actions.audit.test.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Trava de auditoria do multiusuário. Toda server action exportada de um
 * arquivo "use server" que usa a service role precisa estar neste manifesto,
 * com a checagem de posse que faz antes de escrever. Action nova = teste
 * vermelho até alguém conferir a posse e registrar aqui.
 */
const ADMIN_ACTIONS: Record<string, string> = {
  "app/(dashboard)/accounts/actions.ts#disconnectAccount": "ownedAccountId",
  "modules/crm/handoff/services/handoff.actions.ts#assumeConversation": "ownConversationId",
  "modules/crm/handoff/services/handoff.actions.ts#returnToBot": "ownConversationId",
  "modules/crm/history-import/services/history-import.actions.ts#importHistoryStep": "ig_accounts via client do usuário",
  "modules/crm/inbox/services/composer.actions.ts#sendMessage": "ownConversation",
  "modules/crm/inbox/services/composer.actions.ts#uploadComposerAttachment": "ownConversation",
  "modules/crm/inbox/services/inbox.actions.ts#markConversationRead": "conversations via client do usuário",
  "modules/crm/inbox/services/message-actions.ts#hideMessageForMe": "messages via client do usuário",
  "modules/crm/inbox/services/status.actions.ts#setConversationStatus": "ownConversationId",
  "modules/crm/lead-profile/services/lead-profile.actions.ts#refreshLeadPhoto": "conversations via client do usuário",
  "modules/crm/notes/services/notes.actions.ts#createNote": "ownAccountId",
  "modules/crm/notes/services/notes.actions.ts#updateNote": "ownNoteAccountId",
  "modules/crm/notes/services/notes.actions.ts#deleteNote": "ownNoteAccountId",
  "modules/crm/pipeline/services/pipeline.actions.ts#moveLeadAction": "leads via client do usuário + moveLead filtra etapa por conta",
  "modules/crm/pipeline/services/pipeline.actions.ts#getLeadDetailAction": "só client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#loadMoreLeadsAction": "só client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#updateLeadValueAction": "leads via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#bringExistingConversationsAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#toggleAutoEnrollAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#createStageAction": "pipelines via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#updateStageAction": "pipeline_stages + sequences via client do usuário",
  "modules/crm/pipeline/services/pipeline.actions.ts#reorderStagesAction": "pipelines via client do usuário + update filtrado por pipeline_id",
  "modules/crm/pipeline/services/pipeline.actions.ts#deleteStageAction": "pipeline_stages via client do usuário (origem e destino)",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#createQuickReply": "ownAccountId",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#updateQuickReply": "ownQuickReplyAccountId",
  "modules/crm/quick-replies/services/quick-replies.actions.ts#deleteQuickReply": "ownQuickReplyAccountId",
  "modules/crm/tags/services/contact-fields.actions.ts#saveContactField": "assertOwnsAccount",
  "modules/crm/tags/services/contact-fields.actions.ts#deleteContactField": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#openTagManager": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#createTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#renameTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#updateTagColor": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#deleteTag": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#getTagWorkflowUsage": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#applyTagToLead": "assertOwnsAccount",
  "modules/crm/tags/services/tags.actions.ts#applyTagToLeadsBulk": "assertOwnsAccount",
};

const SRC = path.resolve(__dirname, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("auditoria das server actions com service role", () => {
  const found: string[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use server["']/m.test(text) || !text.includes("createAdminClient")) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    for (const m of text.matchAll(/export async function (\w+)/g)) found.push(`${rel}#${m[1]}`);
  }

  it("toda action com service role está no manifesto", () => {
    expect(found.filter((k) => !(k in ADMIN_ACTIONS))).toEqual([]);
  });

  it("o manifesto não lista action que não existe mais", () => {
    expect(Object.keys(ADMIN_ACTIONS).filter((k) => !found.includes(k))).toEqual([]);
  });
});
```

- [ ] **Step 5: Rodar** — `npx vitest run src/lib/auth/__tests__/admin-actions.audit.test.ts`. Se aparecer action fora do manifesto, **ler a action**, confirmar que confere posse com o client do usuário antes de qualquer escrita com o admin (corrigir se não conferir) e só então registrar. Antes de registrar cada linha do manifesto, abrir a action e confirmar que a checagem descrita existe de fato.

- [ ] **Step 6: Revisão dos caminhos internos (sem código novo se estiverem certos).** Conferir, lendo, e anotar o resultado no corpo do commit:
  - `src/app/(dashboard)/crm/funil/page.tsx:46` — `ensureDefaultPipeline(createAdminClient(), accountId)`: o `accountId` precisa vir da lista lida com o client do usuário (linha 26). Se vier de `searchParams` sem conferência contra essa lista, corrigir para usar só ids presentes em `accountsData`.
  - `src/lib/meta/process.ts`, `src/lib/sequences/runtime.ts`, `src/modules/crm/capture/server/*`: toda consulta por conversa/contato/regra filtra por `account_id` da conta do evento.
  - Quem importa módulos que usam o admin: para cada arquivo de `src` (fora de testes) que usa `createAdminClient`, ache os importadores (`grep -rn`) que sejam server action, route handler ou página, e confira que o id de conta/conversa/lead que eles passam adiante vem de uma consulta feita com o client do usuário (ou da sessão), nunca direto de `searchParams`/corpo/formulário. Registre no relatório os que conferiu e qualquer exceção (corrija se for real).
  - Funções SQL: `grep -n "security definer\|grant execute" supabase/migrations/*.sql`. Toda função que recebe `account_id`/`p_account_id`/`user_id` precisa de `revoke all ... from public, anon, authenticated` (como `crm_tag_rename`); trigger functions não são chamáveis pela API. Registre no relatório o que achou e qualquer exceção.
  - Storage (`crm-uploads`): **sem acesso ao banco de produção**. Leia as migrations (`grep -n "storage" supabase/migrations/*.sql`): hoje só a 0011 cria o bucket público, sem nenhuma policy em `storage.objects`. Registre no relatório a frase "nenhuma migration cria policy de select para anon em storage.objects" (ou o que achar). A conferência no painel (Storage → Policies) fica no runbook da Task 13.

- [ ] **Step 7: Verificar** — `npm test` e `npm run typecheck` → verdes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth src/modules/crm "src/app/(dashboard)/accounts/actions.ts"
git commit -m "Helpers de posse, trava de auditoria das actions com service role e etapa sem workflow de outra conta"
```

---

### Task 10: Exclusão após 30 dias

**Files:**
- Create: `src/lib/billing/purge.ts`, `src/lib/billing/purge.test.ts`, `src/app/api/cron/purge/route.ts`

**Interfaces:**
- Consumes: `isOwner`, `isAccessStatus` (Task 2).
- Produces:
  - `purgeExpiredUsers(deps: PurgeDeps): Promise<{ purged: string[] }>`
  - `interface PurgeDeps { admin: QueryClient; removeUploads(accountId: string): Promise<void>; deleteUser(userId: string): Promise<void>; now?: () => Date }`
  - `GET /api/cron/purge` (mesma autenticação do `/api/cron/sequences`)

- [ ] **Step 1: Teste**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { purgeExpiredUsers, type PurgeDeps } from "@/lib/billing/purge";

const NOW = new Date("2026-11-20T06:00:00Z");

describe("purgeExpiredUsers", () => {
  let db: FakeSupabase;
  let deps: PurgeDeps;

  beforeEach(() => {
    db = createFakeAdmin();
    deps = { admin: db.client, removeUploads: vi.fn(async () => {}), deleteUser: vi.fn(async () => {}), now: () => NOW };
    db.tables.ig_accounts.push({ id: "acc-venceu", user_id: "venceu", ig_user_id: "1", status: "active" });
  });

  it("apaga arquivos e usuário de quem passou do prazo", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: ["venceu"] });
    expect(deps.removeUploads).toHaveBeenCalledWith("acc-venceu");
    expect(deps.deleteUser).toHaveBeenCalledWith("venceu");
  });

  it("não toca quem ainda está no prazo", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-25T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
  });

  it("não apaga quem reativou (status com acesso), mesmo com purge_after antigo", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "active", purge_after: "2026-11-19T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("nunca apaga o dono", async () => {
    db.tables.subscriptions.push({ user_id: "user-1", stripe_customer_id: "c0", status: "canceled", purge_after: "2026-01-01T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
  });

  it("sem FALOW_OWNER_USER_ID recusa rodar (senão isOwner() é sempre false e o dono poderia ser apagado)", async () => {
    vi.stubEnv("FALOW_OWNER_USER_ID", "");
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    await expect(purgeExpiredUsers(deps)).rejects.toThrow(/FALOW_OWNER_USER_ID/);
    expect(deps.deleteUser).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("falha nos arquivos não apaga o usuário (tenta de novo amanhã)", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    deps.removeUploads = vi.fn(async () => {
      throw new Error("storage fora");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });
});
```

O fake precisa suportar `.lt("purge_after", iso)` em string ISO — ele lista `lt` como filtro suportado; comparação de strings ISO funciona. Se não funcionar, ajustar o fake.

- [ ] **Step 2: Rodar** — FAIL.

- [ ] **Step 3: `src/lib/billing/purge.ts`**

```ts
import { isAccessStatus, isOwner, type QueryClient } from "@/lib/billing/access";

/**
 * Exclusão LGPD: 30 dias depois do cancelamento, apaga os arquivos do
 * `crm-uploads` e o usuário do Auth. O `on delete cascade` a partir de
 * auth.users → ig_accounts leva contatos, conversas, tokens e o resto.
 * Reconfere o status na hora: quem reativou não é apagado.
 */
export interface PurgeDeps {
  admin: QueryClient;
  removeUploads(accountId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  now?: () => Date;
}

export async function purgeExpiredUsers(deps: PurgeDeps): Promise<{ purged: string[] }> {
  // "Nunca apagar o dono" depende desta variável: sem ela isOwner() é sempre
  // false, e uma assinatura de teste do próprio dono seria apagada em 30 dias.
  if (!process.env.FALOW_OWNER_USER_ID?.trim()) {
    throw new Error("FALOW_OWNER_USER_ID não configurado: o purge se recusa a rodar.");
  }
  const now = (deps.now ?? (() => new Date()))();
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, status, purge_after")
    .lt("purge_after", now.toISOString());
  const rows = (data ?? []) as { user_id: string; status: string; purge_after: string | null }[];

  const purged: string[] = [];
  for (const row of rows) {
    if (!row.purge_after || isOwner(row.user_id) || isAccessStatus(row.status)) continue;
    try {
      const { data: accounts } = await deps.admin.from("ig_accounts").select("id").eq("user_id", row.user_id);
      for (const account of (accounts ?? []) as { id: string }[]) await deps.removeUploads(account.id);
      await deps.deleteUser(row.user_id);
      purged.push(row.user_id);
    } catch (err) {
      console.error(`[purge] ${row.user_id} falhou:`, err instanceof Error ? err.message : err);
    }
  }
  return { purged };
}
```

- [ ] **Step 4: Rodar** — PASS.

- [ ] **Step 5: Rota — `src/app/api/cron/purge/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { purgeExpiredUsers } from "@/lib/billing/purge";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "crm-uploads";

/** Chamado 1x/dia pelo `scheduled()` do Worker (worker.ts). Mesma autenticação do cron das sequências. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const admin = createAdminClient();
  const result = await purgeExpiredUsers({
    admin,
    async removeUploads(accountId) {
      for (;;) {
        const { data, error } = await admin.storage.from(BUCKET).list(accountId, { limit: 1000 });
        if (error) throw new Error(error.message);
        if (!data?.length) return;
        const { error: removeError } = await admin.storage
          .from(BUCKET)
          .remove(data.map((f) => `${accountId}/${f.name}`));
        if (removeError) throw new Error(removeError.message);
      }
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 6: Verificar** — `npm test`, `npm run typecheck` → verdes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/purge.ts src/lib/billing/purge.test.ts src/app/api/cron/purge
git commit -m "Exclusao dos dados 30 dias depois do cancelamento"
```

---

### Task 11: Cloudflare — entrada do Worker, crons e fim da Vercel

**Files:**
- Create: `worker.ts`
- Modify: `wrangler.toml`, `package.json` (scripts), `tsconfig.json` (só se `worker.ts` quebrar o typecheck)
- Delete: `vercel.json`

**Interfaces:**
- Consumes: rotas `/api/cron/sequences` (existente) e `/api/cron/purge` (Task 10); `CRON_SECRET`.
- Produces: Worker com `fetch` do OpenNext + `scheduled()`; crons `* * * * *` e `0 6 * * *`.

- [ ] **Step 1: `worker.ts`** (raiz do projeto)

```ts
// Entrada do Worker: o fetch é o do OpenNext; o scheduled() dispara os
// crons chamando o próprio handler (sem sair pela rede, que pode ser
// bloqueada/loopar no custom domain).
// @ts-expect-error gerado no build (.open-next)
import handler from "./.open-next/worker.js";

// Reexporta as classes de Durable Object que o OpenNext gera.
// @ts-expect-error gerado no build (.open-next)
export * from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: unknown;
}

const ROUTES: Record<string, string> = {
  "* * * * *": "/api/cron/sequences",
  "0 6 * * *": "/api/cron/purge",
};

export default {
  fetch: handler.fetch,

  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const path = ROUTES[controller.cron];
    if (!path) return;
    const base = env.NEXT_PUBLIC_APP_URL ?? "https://falow.app.br";
    const request = new Request(new URL(path, base), {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then(async (res: Response) => {
        if (!res.ok) console.error(`[cron] ${path} → ${res.status} ${await res.text()}`);
      })
    );
  },
};
```

- [ ] **Step 2: `wrangler.toml`**
  - `main = "worker.ts"`
  - trocar `routes` por `routes = [ { pattern = "falow.app.br", custom_domain = true } ]`
  - acrescentar:
    ```toml
    [triggers]
    crons = ["* * * * *", "0 6 * * *"]
    ```
  - Se `npx tsc --noEmit` passar a incluir `worker.ts` e reclamar de tipos de Worker, acrescentar `"worker.ts"` ao `exclude` do `tsconfig.json`.

- [ ] **Step 3: Scripts em `package.json`**
  - remover `build:vercel`;
  - `"build:cloudflare": "node scripts/check-db-schema.mjs && opennextjs-cloudflare build"`;
  - `"deploy:cloudflare": "npm run build:cloudflare && wrangler deploy"`.
  - Apagar `vercel.json`.

- [ ] **Step 4: Verificar o build** — com `.env.local` preenchido (o schema check lê dele via `@next/env`): `npm run build:cloudflare` → termina sem erro e gera `.open-next/worker.js`. Depois `npx wrangler deploy --dry-run --outdir .wrangler-dry` → sem erro (confirma que `worker.ts` empacota com o handler e os Durable Objects). Se o build morrer por memória, usar o build em 2 etapas registrado em `tasks/ai-handoff.md` (`NEXT_PRIVATE_STANDALONE=true` + `opennextjs-cloudflare build --skipNextBuild`).

- [ ] **Step 5: Teste local do cron** — `npx wrangler dev --test-scheduled` e, em outro terminal, `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` → no log do wrangler, nenhuma linha `[cron] ... → 4xx/5xx` (precisa de `CRON_SECRET` em `.dev.vars`).

- [ ] **Step 6: Commit**

```bash
git add worker.ts wrangler.toml package.json tsconfig.json vercel.json
git commit -m "Cloudflare: entrada propria do Worker com crons e dominio falow.app.br"
```

---

### Task 12: Textos — landing, termos, privacidade, README e env

**Files:**
- Modify: `src/app/page.tsx`, `src/app/(legal)/termos-de-servico/page.tsx`, `src/app/(legal)/privacidade/page.tsx`, `src/components/legal/legal-chrome.tsx` (data de vigência), `README.md`, `.env.example`

**Interfaces:**
- Consumes: `POST /api/billing/checkout` (Task 4).

- [ ] **Step 1: Landing.** Em `src/app/page.tsx`: remover todo trecho que diga que a instalação é do usuário/self-hosted/"seu banco, seu app Meta". Trocar o CTA principal por um formulário que posta para o checkout:

```tsx
<form action="/api/billing/checkout" method="post">
  <Button type="submit" size="lg">Assinar o Falow</Button>
</form>
```

  manter o link "Entrar" para `/login`. Manter a seção de permissões da Meta (a análise da Meta lê essa página). Rodar a skill `avoid-ai-writing` no texto novo.

- [ ] **Step 2: Termos de Serviço.** Acrescentar seções (mesmos componentes de `src/components/legal/` que as seções existentes usam):
  - **Assinatura e cobrança:** plano único mensal pela Stripe; renovação automática; preço exibido no checkout.
  - **Cancelamento:** a qualquer momento em "Minha assinatura" (portal da Stripe); o acesso segue até o fim do período pago quando a Stripe estiver configurada para cancelar no fim do período, ou para na hora se cancelado imediatamente; sem multa.
  - **Direito de arrependimento:** 7 dias corridos após a primeira contratação, reembolso integral (CDC, art. 49), pedido pelo e-mail de contato.
  - **Dados após o cancelamento:** automações param na hora; dados guardados por 30 dias para reativação; depois, apagados de forma definitiva.
  - Atualizar a data de vigência em `legal-chrome.tsx`.

- [ ] **Step 3: Privacidade.** Acrescentar a Stripe como operadora (pagamento e cobrança; o Falow não armazena dados de cartão) e o prazo de 30 dias após cancelamento. Controlador continua **PATRICIA POLETINI FONSECA, CNPJ 15.030.598/0001-39** — não mudar.

- [ ] **Step 4: README.** Reescrever a abertura e as seções "Instalação em 5 passos", "Deploy com um clique (Vercel)", "A instalação é sua e de mais ninguém" e "Sequências → Cron da Vercel" para o modelo SaaS: hospedado em `https://falow.app.br`, deploy na Cloudflare (`npm run deploy:cloudflare`), crons no `wrangler.toml`, assinatura pela Stripe, conta por convite. Apontar para `docs/operacao-saas.md`. Atualizar a tabela de variáveis com as 4 novas.

- [ ] **Step 5: `.env.example`.** Trocar o bloco final ("Não existe variável para travar o cadastro...") por:

```bash
# ── Assinatura (Stripe) ────────────────────────────────────────────
# Dashboard Stripe → Developers → API keys
STRIPE_SECRET_KEY=sk_live_...
# Dashboard Stripe → Developers → Webhooks → endpoint
# https://falow.app.br/api/webhooks/stripe → Signing secret
STRIPE_WEBHOOK_SECRET=whsec_...
# Products → Falow → preço mensal → API ID
STRIPE_PRICE_ID=price_...

# ── Dono da instalação ─────────────────────────────────────────────
# UUID do seu usuário no Supabase (Authentication → Users). O dono não
# paga, não tem limite de contas e é o único que vê o botão de IA.
FALOW_OWNER_USER_ID=
```

  e `NEXT_PUBLIC_APP_URL=https://falow.app.br` no exemplo de produção (manter o comentário de dev). Remover as menções à Vercel nos comentários do `CRON_SECRET` (os crons agora vêm do `wrangler.toml`).

- [ ] **Step 6: Verificar** — `npm run typecheck`, `npm test` → verdes; `grep -rni "vercel" src README.md .env.example` → só sobra o que for histórico intencional (nenhuma instrução de uso).

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx "src/app/(legal)" src/components/legal README.md .env.example
git commit -m "Textos do SaaS: landing com assinatura, termos, privacidade e README"
```

---

### Task 13: Runbook de operação e virada

**Files:**
- Create: `docs/operacao-saas.md`
- Create: `scripts/check-tenant-isolation.mjs`

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Script de isolamento contra o banco real — `scripts/check-tenant-isolation.mjs`**

```js
// Confere o RLS com dois usuários de teste reais (criados à mão no Supabase,
// sem assinatura). Uso:
//   TENANT_A_EMAIL=... TENANT_A_PASSWORD=... TENANT_B_EMAIL=... TENANT_B_PASSWORD=... node scripts/check-tenant-isolation.mjs
// A precisa ter ao menos uma linha em ig_accounts (pode ser inserida à mão
// com status 'disconnected'). B tenta ler tudo de A e não pode ver nada.
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function login(email, password) {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

const a = await login(process.env.TENANT_A_EMAIL, process.env.TENANT_A_PASSWORD);
const b = await login(process.env.TENANT_B_EMAIL, process.env.TENANT_B_PASSWORD);

const { data: aAccounts } = await a.from("ig_accounts").select("id");
if (!aAccounts?.length) throw new Error("A não tem ig_accounts; crie uma linha antes.");
const aIds = aAccounts.map((r) => r.id);

const tables = ["ig_accounts", "rules", "sequences", "sequence_runs", "conversations", "interactions", "contacts",
  "messages", "quick_replies", "crm_notes", "crm_tags", "pipelines", "leads", "message_presets", "folders", "sequence_versions"];

let failures = 0;
for (const table of tables) {
  const column = table === "ig_accounts" ? "id" : "account_id";
  const { data, error } = await b.from(table).select("*").in(column, aIds).limit(1);
  if (error) console.log(`ok   ${table} (erro: ${error.message})`);
  else if (data.length) { failures++; console.log(`FAIL ${table}: B leu dado de A`); }
  else console.log(`ok   ${table}`);
}

const { data: subs } = await b.from("subscriptions").select("user_id");
const { data: { user: bUser } } = await b.auth.getUser();
if (subs?.some((s) => s.user_id !== bUser.id)) { failures++; console.log("FAIL subscriptions: B leu assinatura alheia"); }

// Escrita direta em ig_accounts pela API (migration 0017): tem que ser recusada.
// Sem isso, um usuário "reserva" o @ de outra pessoa ou desvia os eventos do webhook.
const forged = await b.from("ig_accounts").insert({
  user_id: bUser.id, ig_user_id: "99999999999999", ig_username: "teste_isolamento",
  access_token_enc: "x", status: "disconnected",
}).select();
if (!forged.error && forged.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: B conseguiu INSERIR uma conta direto pela API (0017 não aplicada?)");
  await b.from("ig_accounts").delete().eq("id", forged.data[0].id);
} else console.log("ok   ig_accounts: insert direto recusado");

const { data: before } = await a.from("ig_accounts").select("ig_username").eq("id", aIds[0]).single();
const tamper = await a.from("ig_accounts").update({ ig_username: "alterado_pela_api" }).eq("id", aIds[0]).select();
if (!tamper.error && tamper.data?.length) {
  failures++;
  console.log("FAIL ig_accounts: A conseguiu ALTERAR a própria conta direto pela API (0017 não aplicada?)");
  await a.from("ig_accounts").update({ ig_username: before.ig_username }).eq("id", aIds[0]);
} else console.log("ok   ig_accounts: update direto recusado");

const { error: signUpError } = await createClient(url, anon).auth.signUp({ email: `teste+${Date.now()}@falow.app.br`, password: "xxxxxxxx1" });
if (!signUpError) { failures++; console.log("FAIL cadastro público ainda aberto no Supabase"); } else console.log("ok   cadastro público fechado");

process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Runbook — `docs/operacao-saas.md`.** Escrever com estas seções, cada uma com os passos concretos (onde clicar, que valor colocar):
  1. **Ordem da virada** (fazer nesta ordem): conferir duplicata de @ (SQL da Task 1) → aplicar `0016_subscriptions.sql` no SQL Editor → `select` nas policies do `storage.objects` para `crm-uploads` (nenhuma `select` para `anon`) → configurar Stripe (seção 2) → Resend + Supabase Auth (seção 3) → secrets do Worker (seção 4) → `npm run deploy:cloudflare` → DNS `falow.app.br` no Worker → Meta (seção 5) → reconectar o @ do dono → **aplicar `0017_ig_accounts_select_only.sql`** (só agora: o código antigo escrevia em `ig_accounts` com o client do usuário e deixaria de conectar/desconectar; depois que a 0017 entra, retirar o deploy antigo da Vercel; **se um dia precisar reverter o código, reverta a 0017 junto, recriando a policy `for all` — com o código antigo e a 0017 aplicada, desconectar e sincronizar perfil falham em silêncio**) → **limpar os tokens legados** no SQL Editor, já com o código novo no ar: `update public.ig_accounts set access_token_enc = '', token_expires_at = null where status <> 'active';` (contas desconectadas/expiradas antes desta versão ainda guardam o token; o código novo já não os usa, a limpeza é defesa em profundidade) → rodar `scripts/check-tenant-isolation.mjs` (precisa dar `ok` nas duas linhas de `ig_accounts`) → compra de teste em modo teste da Stripe (seção 6).
  2. **Stripe:** produto "Falow" com preço mensal (→ `STRIPE_PRICE_ID`); webhook `https://falow.app.br/api/webhooks/stripe` com os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` (→ `STRIPE_WEBHOOK_SECRET`); Customer Portal ativado (cancelar, trocar cartão, ver notas); **Settings → Payment methods: deixe só Cartão ligado** (métodos de pagamento atrasados, como boleto, deixariam a assinatura `incomplete` e quebram a premissa de acesso imediato; o botão Reativar da `/assinatura` também assume cartão); **Billing → Revenue recovery → "se todas as tentativas falharem: cancelar a assinatura"** (é isso que gera o `deleted` e inicia os 30 dias).
  3. **E-mail:** domínio `falow.app.br` no Resend, registros SPF/DKIM no DNS da Cloudflare; Supabase → Authentication → SMTP Settings com host/porta/usuário/senha do Resend e remetente `nao-responda@falow.app.br`, nome "Falow"; Authentication → Sign In / Providers → **desligar "Allow new users to sign up"**; Authentication → Sign In / Providers → Password: **tamanho mínimo 8, sem exigência de tipos de caractere** (igual ao formulário `/definir-senha`; política mais rígida faria o `updateUser` recusar senhas que o app aceita); Authentication → URL Configuration: Site URL `https://falow.app.br`, Redirect URLs `https://falow.app.br/**`; Email Templates em português:
     - **Invite user** — link: `{{ .SiteURL }}/definir-senha?token_hash={{ .TokenHash }}&type=invite`
     - **Reset password** — link: `{{ .SiteURL }}/definir-senha?token_hash={{ .TokenHash }}&type=recovery`
  4. **Secrets do Worker** (`npx wrangler secret put NOME`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `NEXT_PUBLIC_APP_URL=https://falow.app.br`, `TOKEN_ENCRYPTION_KEY` (**o mesmo valor de hoje**, senão os tokens gravados não abrem), `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `FALOW_OWNER_USER_ID`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_CONTACT_EMAIL`. Lembrar: as `NEXT_PUBLIC_*` também precisam existir no ambiente do **build** (são embutidas no bundle) — o `.env.local` cobre o build local. Plano **Workers Paid** ativo na conta.
  5. **Meta (app aprovado):** App Domains `falow.app.br`; Instagram → Business login settings → OAuth redirect `https://falow.app.br/api/auth/meta/callback`; Webhooks → callback `https://falow.app.br/api/webhooks/meta` (mesmo verify token); Settings → Basic → Privacy Policy `https://falow.app.br/privacidade`, Terms `https://falow.app.br/termos-de-servico`, User data deletion `https://falow.app.br/exclusao-de-dados`; portfólio empresarial → campo Site `https://falow.app.br`.
  6. **Compra de teste:** com as chaves de teste da Stripe e o cartão `4242 4242 4242 4242`, comprar pela landing com um e-mail seu → e-mail de convite chega pelo Resend → definir senha → painel abre → conectar um @ de teste → bot responde → cancelar pelo portal (cancelar imediatamente) → painel vai para `/assinatura` com a data de exclusão → bot não responde mais → reativar → tudo volta. Depois trocar para as chaves live.
  7. **Isolamento do storage e funções SQL:** o que a revisão da Task 9 achou (lendo as migrations, sem acesso à produção): **nenhuma migration cria policy de select para anon em `storage.objects`; a 0011 só cria o bucket público `crm-uploads`** (policies criadas à mão no painel não aparecem nas migrations, por isso a conferência abaixo); a única função `security definer` é `falow_user_id_by_email` (0016), concedida só ao `service_role`; e mandar conferir no painel do Supabase: Storage → Policies (nenhuma policy `select` para `anon`/`public` no bucket `crm-uploads`) e Database → Functions (nenhuma função com `account_id` executável por `anon`/`authenticated`).
  8. **Compra repetida / duplicada:** no log do Worker (Cloudflare → Workers → falow → Logs) procure `[stripe] compra repetida ignorada`; a mensagem traz o usuário e os ids das duas assinaturas e dos dois clientes. Confira na Stripe o status da assinatura ANTIGA: se estiver saudável (`active`), cancele/reembolse a NOVA; se estiver `past_due` ou com cancelamento agendado, é a NOVA que deve ficar: cancele/reembolse a antiga e atualize a linha do usuário em `subscriptions` (`stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end`) com os dados da nova.

- [ ] **Step 3: Commit**

```bash
git add docs/operacao-saas.md scripts/check-tenant-isolation.mjs
git commit -m "Runbook da virada para SaaS e checagem de isolamento contra o banco real"
```

---

### Task 14: Fechar a escrita direta em `ig_accounts` (RLS só leitura) — executar logo após a Task 8, antes da Task 9

**Por quê (achado do chefe da Task 1).** A policy `own accounts` (0001) é `for all`: qualquer usuário logado escreve em `ig_accounts` direto pela API (chave anon + JWT dele), inclusive com o `ig_user_id` de outra pessoa. Com o índice único da 0016 isso deixa o atacante (a) "reservar" o @ de um cliente futuro (a conexão real recebe `account_taken`), (b) desviar para uma conta falsa os eventos do webhook de um @ que ficou desconectado ou expirado — as DMs dele cairiam no CRM do atacante — e (c) driblar o limite de 1 @. A correção: o usuário só **lê** `ig_accounts`; conectar (Task 8), desconectar e sincronizar perfil passam pelo servidor (service role), depois de conferir a sessão e a posse.

**Files:**
- Create: `supabase/migrations/0017_ig_accounts_select_only.sql`
- Modify: `src/app/(dashboard)/accounts/actions.ts` (`disconnectAccount`)
- Modify: `src/lib/meta/account-profile.ts` (só o comentário de `withSyncedProfiles`), `src/app/(dashboard)/accounts/page.tsx`, `src/app/(dashboard)/rules/sequencias/nova/page.tsx`, `src/app/(dashboard)/rules/sequencias/[id]/page.tsx` (chamadas de `withSyncedProfiles`)
- Test: `src/app/(dashboard)/accounts/actions.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` (`@/lib/supabase/admin`), `createClient` (`@/lib/supabase/server`).
- Produces: `disconnectAccount(id: string): Promise<ActionResult>` (mesma assinatura; agora confere a posse com o client do usuário e escreve com o admin). Migration `0017`, que **só pode ser aplicada depois do deploy do código novo** (o código antigo escrevia em `ig_accounts` com o client do usuário).

- [ ] **Step 1: Migration `supabase/migrations/0017_ig_accounts_select_only.sql`**

```sql
-- ══════════════════════════════════════════════════════════════════════════
-- Falow multiusuário: ig_accounts passa a ser SOMENTE LEITURA para o usuário.
--
-- A policy "own accounts" (0001) era `for all`: qualquer usuário logado escrevia
-- em ig_accounts direto pela API (chave anon + JWT dele), inclusive com o
-- ig_user_id de outra pessoa. Com o índice único da 0016 isso deixaria um
-- usuário "reservar" o @ de quem ainda vai conectar, ou desviar para uma conta
-- falsa os eventos do webhook de um @ desconectado. Conectar, desconectar e
-- sincronizar perfil passam pelo servidor (service role), depois de conferir a
-- sessão e a posse.
--
-- ORDEM DE APLICAÇÃO: só DEPOIS de publicar o código novo. O código antigo
-- escrevia em ig_accounts com o client do usuário e deixaria de conectar.
-- As policies das outras tabelas consultam ig_accounts por subselect e seguem
-- funcionando, porque a policy de select continua.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "own accounts" on public.ig_accounts;
drop policy if exists "own accounts select" on public.ig_accounts;
create policy "own accounts select" on public.ig_accounts
  for select using (user_id = auth.uid());
```

- [ ] **Step 2: Teste de `disconnectAccount`** — `src/app/(dashboard)/accounts/actions.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state } = vi.hoisted(() => ({
  state: { admin: null as unknown, ownedIds: [] as string[] },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (state.admin as FakeSupabase).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  // client do usuário: o RLS de select só devolve as contas dele (não tem .update)
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({ data: state.ownedIds.includes(id) ? { id } : null, error: null }),
        }),
      }),
    }),
  }),
}));

import { disconnectAccount } from "@/app/(dashboard)/accounts/actions";

describe("disconnectAccount", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.admin = db;
    db.tables.ig_accounts.push({ id: "acc-minha", user_id: "c1", ig_user_id: "1", status: "active" });
    db.tables.ig_accounts.push({ id: "acc-alheia", user_id: "c2", ig_user_id: "2", status: "active" });
    state.ownedIds = ["acc-minha"];
  });

  it("desconecta a conta do próprio usuário", async () => {
    expect(await disconnectAccount("acc-minha")).toEqual({});
    expect(db.tables.ig_accounts.find((a) => a.id === "acc-minha")!.status).toBe("disconnected");
  });

  it("recusa conta de outro usuário e não escreve nada", async () => {
    const result = await disconnectAccount("acc-alheia");
    expect(result.error).toBeTruthy();
    expect(db.tables.ig_accounts.find((a) => a.id === "acc-alheia")!.status).toBe("active");
  });
});
```

- [ ] **Step 3: Rodar** — `npx vitest run "src/app/(dashboard)/accounts/actions.test.ts"` → FAIL (a action atual chama `.update` no client do usuário, que o mock não tem).

- [ ] **Step 4: Reescrever `src/app/(dashboard)/accounts/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

/**
 * Desconecta a conta: as automações param imediatamente.
 * Reconectar via OAuth reativa a mesma linha (upsert por user_id + ig_user_id).
 *
 * A policy de `ig_accounts` é só leitura para o usuário (migration 0017): a
 * posse é conferida com o client dele (RLS de select) e a escrita vai pela
 * service role.
 */
export async function disconnectAccount(id: string): Promise<ActionResult> {
  const { data: owned } = await createClient()
    .from("ig_accounts")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: string }>();
  if (!owned) return { error: "Conta não encontrada." };

  const { error } = await createAdminClient()
    .from("ig_accounts")
    .update({ status: "disconnected" })
    .eq("id", owned.id);

  if (error) return { error: "Não foi possível desconectar a conta." };

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/rules");
  return {};
}
```

- [ ] **Step 5: Rodar** o teste do Step 2 → PASS.

- [ ] **Step 6: Sincronização de perfil.** `withSyncedProfiles(db, accounts)` (`src/lib/meta/account-profile.ts`) escreve `ig_username`/`profile_picture_url` com o `db` que recebe, e as três páginas passam o client do usuário — depois da 0017 essa escrita viraria um no-op silencioso (o @ e a foto deixariam de atualizar). Em `accounts/page.tsx`, `rules/sequencias/nova/page.tsx` e `rules/sequencias/[id]/page.tsx`, trocar o primeiro argumento da chamada de `withSyncedProfiles(...)` de `supabase` para `createAdminClient()` (importar de `@/lib/supabase/admin`; manter `supabase` onde ele ainda é usado para as consultas). As contas passadas já vieram de uma consulta do próprio usuário (RLS), então só as dele são sincronizadas. Em `account-profile.ts`, acrescentar ao comentário de `withSyncedProfiles`: "`db` precisa conseguir escrever em `ig_accounts` (service role): para o usuário a tabela é só leitura (migration 0017)". Não mexer na lógica nem nos testes existentes de `account-profile.test.ts`.

- [ ] **Step 7: Achar outras escritas.** Rode `grep -rn -B1 -A4 'from("ig_accounts")' src --include=*.ts --include=*.tsx` (ignore `*.test.*`) e, para cada `.insert(`/`.update(`/`.upsert(`/`.delete(`, confirme qual client faz a escrita: precisa ser admin (service role) em todas — callback do OAuth (já admin pela Task 8), `disconnectAccount` (Step 4), `syncAccountProfile` (via `withSyncedProfiles` / `gate.ts`), `token.ts`, `process.ts`, `runtime.ts`. Se achar alguma que ainda escreve com o client do usuário, corrija do mesmo jeito e liste no relatório.

- [ ] **Step 8: Verificar** — suíte inteira e typecheck → verdes (comandos `node` do `context.md`).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0017_ig_accounts_select_only.sql "src/app/(dashboard)/accounts" "src/app/(dashboard)/rules/sequencias" src/lib/meta/account-profile.ts
git commit -m "ig_accounts somente leitura para o usuario (0017): conectar, desconectar e sincronizar perfil passam pelo servidor"
```

---

## Depois do plano (fora do código)

- Atualizar a memória `falow-producao-vercel` (produção passa a ser Cloudflare em `falow.app.br`) e `falow-app-review-meta` (trava single-tenant caiu).
- Atualizar `tasks/ai-handoff.md` com o estado final.
