import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { listCustomers } from "@/lib/admin/customers";

const USERS = [
  { id: "user-1", email: "dono@falow.app.br", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-10-01T00:00:00Z" },
  { id: "c1", email: "Ana@Cliente.com", created_at: "2026-05-01T00:00:00Z", last_sign_in_at: null },
  { id: "c2", email: "bia@outra.com", created_at: "2026-09-01T00:00:00Z", last_sign_in_at: "2026-10-10T00:00:00Z" },
];

describe("listCustomers", () => {
  let db: FakeSupabase;
  let listUsers: ReturnType<typeof vi.fn>;
  let users: typeof USERS;
  const admin = () => db.client as never;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    db = createFakeAdmin();
    users = [...USERS];
    listUsers = vi.fn(async (input: RequestInfo | URL) => {
      const params = new URL(String(input)).searchParams;
      const page = Number(params.get("page"));
      const size = Number(params.get("per_page"));
      const filter = params.get("filter") ?? "";
      const filtered = users.filter((u) => u.email.toLowerCase().includes(filter))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
      return new Response(JSON.stringify({ users: filtered.slice((page - 1) * size, page * size) }), {
        headers: { "x-total-count": String(filtered.length) },
      });
    });
    vi.stubGlobal("fetch", listUsers);
    db.tables.subscriptions.push(
      { user_id: "c2", status: "active", current_period_end: "2026-11-10T00:00:00Z", purge_after: null, stripe_customer_id: "cus_c2" },
      { user_id: "c1", status: "canceled", current_period_end: "2026-10-01T00:00:00Z", purge_after: "2026-11-01T00:00:00Z" }
    );
    db.tables.ig_accounts.push(
      { id: "a1", user_id: "c2", ig_username: "bia.loja", status: "active" },
      { id: "a2", user_id: "c1", ig_username: "ana.velha", status: "disconnected" }
    );
    db.tables.access_grants.push({ user_id: "c1", kind: "courtesy", expires_at: "2026-12-01T00:00:00Z", reason: "parceira", granted_by: "user-1" });
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("junta auth + assinatura + @ ativo + cortesia/bloqueio, ordenado por cadastro desc", async () => {
    const { customers, page, totalPages, total } = await listCustomers(admin(), {});
    expect({ page, totalPages, total }).toEqual({ page: 1, totalPages: 1, total: 3 });
    expect(listUsers).toHaveBeenCalledTimes(1);
    const [url, init] = listUsers.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("page")).toBe("1");
    expect(new URL(String(url)).searchParams.get("per_page")).toBe("50");
    expect(new URL(String(url)).searchParams.get("sort")).toBe("created_at desc");
    expect(init).toEqual(expect.objectContaining({ cache: "no-store", headers: { apikey: "test-service-key", Authorization: "Bearer test-service-key" } }));
    expect(customers.map((c) => c.userId)).toEqual(["c2", "c1", "user-1"]);
    expect(customers[0]).toEqual({
      userId: "c2",
      email: "bia@outra.com",
      createdAt: "2026-09-01T00:00:00Z",
      lastSignInAt: "2026-10-10T00:00:00Z",
      isAdmin: false,
      igUsername: "bia.loja",
      subscriptionStatus: "active",
      currentPeriodEnd: "2026-11-10T00:00:00Z",
      purgeAfter: null,
      stripeCustomerId: "cus_c2",
      grant: null,
    });
    expect(customers[1]).toEqual(
      expect.objectContaining({
        userId: "c1",
        igUsername: null,
        subscriptionStatus: "canceled",
        purgeAfter: "2026-11-01T00:00:00Z",
        grant: { kind: "courtesy", expiresAt: "2026-12-01T00:00:00Z", reason: "parceira" },
      })
    );
    expect(customers[2]).toEqual(expect.objectContaining({ userId: "user-1", isAdmin: true, subscriptionStatus: null, grant: null }));
  });

  it("busca por e-mail sem diferenciar maiúscula", async () => {
    const { customers } = await listCustomers(admin(), { search: "  ana@CLIENTE " });
    expect(customers.map((c) => c.userId)).toEqual(["c1"]);
    expect(new URL(String(listUsers.mock.calls[0][0])).searchParams.get("filter")).toBe("ana@cliente");
  });

  it("busca além dos primeiros 2.000 cadastros e pagina antes de ler os dados extras", async () => {
    users = Array.from({ length: 2101 }, (_, i) => ({
      id: `c${i}`, email: `cliente${i}@exemplo.com`, created_at: "2026-10-01T00:00:00Z", last_sign_in_at: null,
    }));
    const found = await listCustomers(admin(), { search: "cliente2100@" });
    expect(found.customers.map((c) => c.userId)).toEqual(["c2100"]);
    expect(listUsers).toHaveBeenCalledTimes(1);
    const first = await listCustomers(admin());
    const second = await listCustomers(admin(), { page: 2 });
    expect(first.total).toBe(2101);
    expect(first.totalPages).toBe(43);
    expect(first.customers).toHaveLength(50);
    expect(second.customers).toHaveLength(50);
    expect(second.page).toBe(2);
    expect(second.customers.some((c) => first.customers.some((a) => a.userId === c.userId))).toBe(false);
    const last = await listCustomers(admin(), { page: 1000 });
    expect(last.page).toBe(43);
    expect(last.customers).toHaveLength(1);
    expect(listUsers).toHaveBeenCalledTimes(5); // busca, duas páginas e página fora do intervalo + correção.
  });

  it.each([0, -1, NaN, 1.5])("normaliza página inválida %s", async (page) => {
    expect((await listCustomers(admin(), { page })).page).toBe(1);
  });

  it("não lê tabelas de conversas, contatos nem mensagens", async () => {
    const from = vi.fn((t: string) => db.client.from(t as never));
    const spied = { from, rpc: db.client.rpc } as never;
    await listCustomers(spied, {});
    const tables = new Set(from.mock.calls.map((c) => c[0]));
    expect([...tables].sort()).toEqual(["access_grants", "ig_accounts", "subscriptions"]);
  });

  it("erro do listUsers vira exceção", async () => {
    listUsers.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(listCustomers(admin(), {})).rejects.toThrow(/HTTP 503/);
  });

  it("recusa resposta sem contagem em vez de mostrar total incorreto", async () => {
    listUsers.mockResolvedValueOnce(new Response(JSON.stringify({ users: [] })));
    await expect(listCustomers(admin())).rejects.toThrow(/paginação inválida/);
  });
});
