import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("env do dono com espaço no fim: o dono continua protegido (guard e isOwner leem o mesmo valor)", async () => {
    vi.stubEnv("FALOW_OWNER_USER_ID", "user-1 ");
    db.tables.ig_accounts.push({ id: "acc-dono", user_id: "user-1", ig_user_id: "9", status: "active" });
    db.tables.subscriptions.push({ user_id: "user-1", stripe_customer_id: "c0", status: "canceled", purge_after: "2026-01-01T00:00:00Z" });
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.removeUploads).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("só apaga assinatura canceled: incomplete, unpaid e paused com purge_after antigo ficam", async () => {
    for (const status of ["incomplete", "unpaid", "paused"]) {
      db.tables.subscriptions.push({ user_id: `u-${status}`, stripe_customer_id: `c-${status}`, status, purge_after: "2026-11-19T00:00:00Z" });
    }
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(deps.removeUploads).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("reativou entre a consulta e a exclusão: relê a assinatura e não apaga nada", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    let subscriptionReads = 0;
    deps.admin = {
      from: (table: string) => {
        if (table === "subscriptions" && ++subscriptionReads === 2) {
          // webhook de reativação chega depois do select inicial
          db.tables.subscriptions[0] = { user_id: "venceu", stripe_customer_id: "c1", status: "active", purge_after: null };
        }
        return db.client.from(table as never);
      },
    };
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(subscriptionReads).toBe(2);
    expect(deps.removeUploads).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("releitura da assinatura que falha: pula o usuário (falha segura)", async () => {
    db.tables.subscriptions.push({ user_id: "venceu", stripe_customer_id: "c1", status: "canceled", purge_after: "2026-11-19T00:00:00Z" });
    let subscriptionReads = 0;
    deps.admin = {
      from: (table: string) => {
        if (table === "subscriptions" && ++subscriptionReads === 2) {
          const broken: Record<string, unknown> = {};
          for (const m of ["select", "eq", "neq", "lt"]) broken[m] = () => broken;
          broken.maybeSingle = async () => ({ data: null, error: { message: "banco fora" } });
          return broken;
        }
        return db.client.from(table as never);
      },
    };
    expect(await purgeExpiredUsers(deps)).toEqual({ purged: [] });
    expect(subscriptionReads).toBe(2);
    expect(deps.removeUploads).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

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
});
