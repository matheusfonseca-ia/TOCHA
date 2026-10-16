import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const admin = () => ({ ...db.client, auth: { admin: { listUsers } } }) as never;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createFakeAdmin();
    // 2 páginas: [dono, c1] e [c2].
    listUsers = vi.fn(async ({ page }: { page: number }) =>
      page === 1
        ? { data: { users: USERS.slice(0, 2), nextPage: 2, lastPage: 2 }, error: null }
        : { data: { users: USERS.slice(2), nextPage: null, lastPage: 2 }, error: null }
    );
    db.tables.subscriptions.push(
      { user_id: "c2", status: "active", current_period_end: "2026-11-10T00:00:00Z", purge_after: null },
      { user_id: "c1", status: "canceled", current_period_end: "2026-10-01T00:00:00Z", purge_after: "2026-11-01T00:00:00Z" }
    );
    db.tables.ig_accounts.push(
      { id: "a1", user_id: "c2", ig_username: "bia.loja", status: "active" },
      { id: "a2", user_id: "c1", ig_username: "ana.velha", status: "disconnected" }
    );
    db.tables.access_grants.push({ user_id: "c1", kind: "courtesy", expires_at: "2026-12-01T00:00:00Z", reason: "parceira", granted_by: "user-1" });
  });

  it("junta auth + assinatura + @ ativo + cortesia/bloqueio, ordenado por cadastro desc", async () => {
    const { customers, truncated } = await listCustomers(admin(), {});
    expect(truncated).toBe(false);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 200 });
    expect(listUsers).toHaveBeenCalledWith({ page: 2, perPage: 200 });
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
  });

  it("marca truncated e avisa quando para no limite de páginas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { customers, truncated } = await listCustomers(admin(), { maxPages: 1 });
    expect(truncated).toBe(true);
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(customers.map((c) => c.userId)).toEqual(["c1", "user-1"]);
    expect(warn).toHaveBeenCalled();
  });

  it("não lê tabelas de conversas, contatos nem mensagens", async () => {
    const from = vi.fn((t: string) => db.client.from(t as never));
    const spied = { from, rpc: db.client.rpc, auth: { admin: { listUsers } } } as never;
    await listCustomers(spied, {});
    const tables = new Set(from.mock.calls.map((c) => c[0]));
    expect([...tables].sort()).toEqual(["access_grants", "ig_accounts", "subscriptions"]);
  });

  it("erro do listUsers vira exceção", async () => {
    listUsers.mockResolvedValueOnce({ data: { users: [] }, error: { message: "boom" } });
    await expect(listCustomers(admin(), {})).rejects.toThrow(/boom/);
  });
});
