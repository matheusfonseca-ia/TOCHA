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
