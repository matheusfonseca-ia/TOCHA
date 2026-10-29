import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { ADMIN_TARGET_ERROR, blockUser, CONCURRENT_CHANGE_ERROR, grantCourtesy, revokeCourtesy, unblockUser } from "@/lib/admin/grants";

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

  it("cortesia sem prazo grava expires_at nulo e registra na auditoria", async () => {
    const r = await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: null, reason: "sócio", now: NOW });
    expect(r).toEqual({ ok: true });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c1", kind: "courtesy", expires_at: null })]);
    expect(db.tables.admin_audit_log).toEqual([expect.objectContaining({ action: "courtesy_grant", details: { expires_at: null, reason: "sócio" } })]);
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

  it("cortesia em cliente bloqueado e recusada (bloqueio > cortesia) e nao desbloqueia", async () => {
    await blockUser(admin(), { adminId: "user-1", targetUserId: "c1", reason: "abuso" });
    const r = await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "x", now: NOW });
    expect(r).toEqual({ ok: false, error: "Cliente bloqueado: desbloqueie antes de dar cortesia." });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c1", kind: "block" })]);
    expect(db.tables.admin_audit_log.map((e) => e.action)).toEqual(["block"]);
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

  it.each([false, true])("avisa estado incerto se auditoria e reversão falham (linha anterior: %s)", async (existing) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (existing) await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "x", now: NOW });
    const real = db.client;
    // A reversão (update/delete condicionados a .eq(...).eq(...)) falha.
    const failingChain = () => {
      const chain = { eq: () => chain, then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: { message: "restore down" } }).then(ok) };
      return chain;
    };
    const failing = {
      from: (t: string) => {
        if (t === "admin_audit_log") return { insert: async () => ({ error: { message: "audit down" } }) };
        const q = real.from(t as never);
        q.update = (() => failingChain()) as never;
        q.delete = (() => failingChain()) as never;
        return q;
      },
    };
    const result = await blockUser(failing as never, { adminId: "user-1", targetUserId: "c1", reason: "abuso" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("A alteração pode continuar aplicada") });
    expect(db.tables.access_grants[0].kind).toBe("block");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("falha ao reverter"), "restore down");
  });

  it("bloqueio aplicado por outro admin entre a leitura e a escrita vence a cortesia", async () => {
    await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "x", now: NOW });
    const real = db.client;
    let reads = 0;
    // Depois da leitura do estado atual, outro admin bloqueia o cliente.
    const racing = {
      from: (t: string) => {
        const q = real.from(t as never);
        if (t === "access_grants") {
          const maybeSingle = q.maybeSingle.bind(q);
          q.maybeSingle = (async () => {
            const res = await maybeSingle();
            if (++reads === 1) db.tables.access_grants[0].kind = "block";
            return res;
          }) as never;
        }
        return q;
      },
    };
    const r = await grantCourtesy(racing as never, { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "y", now: NOW });
    expect(r).toEqual({ ok: false, error: CONCURRENT_CHANGE_ERROR });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ user_id: "c1", kind: "block" })]);
    expect(db.tables.admin_audit_log.map((e) => e.action)).toEqual(["courtesy_grant"]);
  });

  it("renovar cortesia existente atualiza a linha", async () => {
    await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: in30, reason: "x", now: NOW });
    const r = await grantCourtesy(admin(), { adminId: "user-1", targetUserId: "c1", expiresAt: null, reason: "renovada", now: NOW });
    expect(r).toEqual({ ok: true });
    expect(db.tables.access_grants).toEqual([expect.objectContaining({ kind: "courtesy", expires_at: null, reason: "renovada" })]);
  });
});
