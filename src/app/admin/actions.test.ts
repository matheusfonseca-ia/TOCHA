import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const h = vi.hoisted(() => ({
  isAdminSession: true,
  db: null as unknown as FakeSupabase,
  auth: null as unknown as {
    admin: { getUserById: ReturnType<typeof import("vitest").vi.fn>; inviteUserByEmail: ReturnType<typeof import("vitest").vi.fn> };
    resetPasswordForEmail: ReturnType<typeof import("vitest").vi.fn>;
  },
  rpc: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  createAdminClient: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/admin/require-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/require-admin")>();
  return {
    ...real,
    requireAdmin: async () => {
      if (!h.isAdminSession) throw new real.AdminRequiredError();
      return { adminId: "user-1" };
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => h.createAdminClient(...args),
}));

import {
  blockUserAction,
  grantCourtesyAction,
  inviteWithCourtesyAction,
  resendAccessAction,
  revokeCourtesyAction,
  unblockUserAction,
} from "@/app/admin/actions";
import { ADMIN_TARGET_ERROR } from "@/lib/admin/grants";

const C1 = "11111111-1111-4111-8111-111111111111";
const OTHER_ADMIN = "22222222-2222-4222-8222-222222222222";
const NEW_USER = "33333333-3333-4333-8333-333333333333";
const DENIED = { ok: false, error: "Acesso restrito a administradores." };

const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://falow.app.br/sistema";
  process.env.FALOW_ADMIN_USER_IDS = OTHER_ADMIN;
  h.isAdminSession = true;
  h.db = createFakeAdmin();
  h.rpc = vi.fn(async () => ({ data: null, error: null }));
  h.auth = {
    admin: {
      getUserById: vi.fn(async () => ({ data: { user: { id: C1, email: "ana@cliente.com", last_sign_in_at: null } }, error: null })),
      inviteUserByEmail: vi.fn(async () => ({ data: { user: { id: NEW_USER } }, error: null })),
    },
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
  };
  h.createAdminClient = vi.fn(() => ({ from: (t: string) => h.db.from(t as never), rpc: h.rpc, auth: h.auth }));
});

const allActions: [string, () => Promise<unknown>][] = [
  ["grantCourtesyAction", () => grantCourtesyAction(form({ userId: C1, expiresAt: in30(), reason: "parceiro" }))],
  ["revokeCourtesyAction", () => revokeCourtesyAction(C1)],
  ["blockUserAction", () => blockUserAction(form({ userId: C1, reason: "abuso" }))],
  ["unblockUserAction", () => unblockUserAction(C1)],
  ["resendAccessAction", () => resendAccessAction(C1)],
  ["inviteWithCourtesyAction", () => inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "parceiro" }))],
];

function expectUntouched() {
  expect(h.createAdminClient).not.toHaveBeenCalled();
  expect(h.db.tables.access_grants).toHaveLength(0);
  expect(h.db.tables.admin_audit_log).toHaveLength(0);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.auth.admin.getUserById).not.toHaveBeenCalled();
  expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  expect(h.auth.resetPasswordForEmail).not.toHaveBeenCalled();
}

describe("actions do /admin sem sessão de admin", () => {
  it.each(allActions)("%s recusa sem tocar no banco nem no Auth", async (_name, run) => {
    h.isAdminSession = false;
    expect(await run()).toEqual(DENIED);
    expectUntouched();
  });
});

describe("validação", () => {
  it("userId que não é UUID é recusado sem tocar no banco", async () => {
    expect(await revokeCourtesyAction("c1")).toEqual({ ok: false, error: "Cliente inválido." });
    expect(await unblockUserAction("x")).toEqual({ ok: false, error: "Cliente inválido." });
    expect(await resendAccessAction("nope")).toEqual({ ok: false, error: "Cliente inválido." });
    expect(await grantCourtesyAction(form({ userId: "c1", expiresAt: in30(), reason: "x" }))).toEqual({ ok: false, error: "Cliente inválido." });
    expect(await blockUserAction(form({ userId: "c1", reason: "x" }))).toEqual({ ok: false, error: "Cliente inválido." });
    expect(h.db.tables.access_grants).toHaveLength(0);
    expect(h.db.tables.admin_audit_log).toHaveLength(0);
    expect(h.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it("motivo vazio e data inválida são recusados", async () => {
    expect(await blockUserAction(form({ userId: C1, reason: "  " }))).toEqual({ ok: false, error: "Informe o motivo." });
    expect(await grantCourtesyAction(form({ userId: C1, expiresAt: "amanhã", reason: "x" }))).toEqual({ ok: false, error: "Data inválida." });
    expect(h.db.tables.access_grants).toHaveLength(0);
  });

  it("e-mail inválido no convite é recusado", async () => {
    expect(await inviteWithCourtesyAction(form({ email: "nao-e-email", expiresAt: in30(), reason: "x" }))).toEqual({ ok: false, error: "E-mail inválido." });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe("actions com admin", () => {
  it("grantCourtesyAction grava cortesia e auditoria", async () => {
    expect(await grantCourtesyAction(form({ userId: C1, expiresAt: in30(), reason: "parceiro" }))).toEqual({ ok: true });
    expect(h.db.tables.access_grants).toEqual([expect.objectContaining({ user_id: C1, kind: "courtesy", granted_by: "user-1" })]);
    expect(h.db.tables.admin_audit_log.map((e) => e.action)).toEqual(["courtesy_grant"]);
  });

  it("grantCourtesyAction com validade vazia grava cortesia sem prazo; data inválida continua recusada", async () => {
    expect(await grantCourtesyAction(form({ userId: C1, expiresAt: "", reason: "sócio" }))).toEqual({ ok: true });
    expect(h.db.tables.access_grants).toEqual([expect.objectContaining({ user_id: C1, kind: "courtesy", expires_at: null })]);
    expect(await grantCourtesyAction(form({ userId: C1, expiresAt: "sem-data", reason: "sócio" }))).toEqual({ ok: false, error: "Data inválida." });
  });

  it("revokeCourtesyAction remove a cortesia", async () => {
    await grantCourtesyAction(form({ userId: C1, expiresAt: in30(), reason: "parceiro" }));
    expect(await revokeCourtesyAction(C1)).toEqual({ ok: true });
    expect(h.db.tables.access_grants).toHaveLength(0);
    expect(h.db.tables.admin_audit_log.map((e) => e.action)).toEqual(["courtesy_grant", "courtesy_revoke"]);
  });

  it("blockUserAction e unblockUserAction", async () => {
    expect(await blockUserAction(form({ userId: C1, reason: "abuso" }))).toEqual({ ok: true });
    expect(h.db.tables.access_grants).toEqual([expect.objectContaining({ user_id: C1, kind: "block", reason: "abuso" })]);
    expect(await unblockUserAction(C1)).toEqual({ ok: true });
    expect(h.db.tables.access_grants).toHaveLength(0);
    expect(h.db.tables.admin_audit_log.map((e) => e.action)).toEqual(["block", "unblock"]);
  });

  it("resendAccessAction manda o convite e audita", async () => {
    expect(await resendAccessAction(C1)).toEqual({ ok: true });
    expect(h.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("ana@cliente.com", { redirectTo: "https://falow.app.br/sistema/definir-senha" });
    expect(h.db.tables.admin_audit_log).toEqual([expect.objectContaining({ action: "invite_resend", target_user_id: C1 })]);
  });

  it("alvo admin é recusado", async () => {
    expect(await blockUserAction(form({ userId: OTHER_ADMIN, reason: "x" }))).toEqual({ ok: false, error: ADMIN_TARGET_ERROR });
    expect(await resendAccessAction(OTHER_ADMIN)).toEqual({ ok: false, error: ADMIN_TARGET_ERROR });
    expect(h.db.tables.access_grants).toHaveLength(0);
    expect(h.db.tables.admin_audit_log).toHaveLength(0);
  });

  it("inviteWithCourtesyAction com e-mail existente só grava cortesia e audita courtesy_invite", async () => {
    h.rpc.mockResolvedValueOnce({ data: C1, error: null });
    const r = await inviteWithCourtesyAction(form({ email: " Ana@Cliente.com ", expiresAt: in30(), reason: "parceira" }));
    expect(r).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("falow_user_id_by_email", { p_email: "ana@cliente.com" });
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(h.db.tables.access_grants).toEqual([expect.objectContaining({ user_id: C1, kind: "courtesy" })]);
    expect(h.db.tables.admin_audit_log.map((e) => e.action)).toEqual(["courtesy_invite", "courtesy_invite", "courtesy_grant"]);
    // Registro só cresce: o pedido fica como foi gravado e a conclusão vem numa linha nova.
    expect(h.db.tables.admin_audit_log[0]).toEqual(
      expect.objectContaining({ target_user_id: C1, details: { email: "ana@cliente.com", status: "requested" } })
    );
    expect(h.db.tables.admin_audit_log[1]).toEqual(
      expect.objectContaining({
        target_user_id: C1,
        details: { email: "ana@cliente.com", invited: false, status: "existing", request_id: h.db.tables.admin_audit_log[0].id },
      })
    );
  });

  it("inviteWithCourtesyAction com e-mail novo convida e grava cortesia", async () => {
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "parceiro" }));
    expect(r).toEqual({ ok: true });
    expect(h.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("novo@cliente.com", { redirectTo: "https://falow.app.br/sistema/definir-senha" });
    expect(h.db.tables.access_grants).toEqual([expect.objectContaining({ user_id: NEW_USER, kind: "courtesy" })]);
    expect(h.db.tables.admin_audit_log[1]).toEqual(
      expect.objectContaining({ action: "courtesy_invite", target_user_id: NEW_USER, details: expect.objectContaining({ email: "novo@cliente.com", invited: true, status: "created" }) })
    );
  });

  it("inviteWithCourtesyAction para e-mail de admin é recusado sem convidar", async () => {
    h.rpc.mockResolvedValueOnce({ data: OTHER_ADMIN, error: null });
    expect(await inviteWithCourtesyAction(form({ email: "admin@falow.app.br", expiresAt: in30(), reason: "x" }))).toEqual({
      ok: false,
      error: ADMIN_TARGET_ERROR,
    });
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(h.db.tables.access_grants).toHaveLength(0);
  });

  it("inviteWithCourtesyAction com validade no passado não convida ninguém", async () => {
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: "2020-01-01", reason: "x" }));
    expect(r.ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("conta criada fica auditada mesmo se a cortesia falha depois", async () => {
    const originalFrom = h.db.from.bind(h.db);
    vi.spyOn(h.db, "from").mockImplementation((table) => {
      if (table === "access_grants") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "indisponível" } }) }) }) } as never;
      return originalFrom(table);
    });
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "parceiro" }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Convite enviado, mas a cortesia falhou") });
    expect(h.db.tables.admin_audit_log).toEqual([
      expect.objectContaining({ action: "courtesy_invite", details: { email: "novo@cliente.com", status: "requested" } }),
      expect.objectContaining({ action: "courtesy_invite", target_user_id: NEW_USER, details: expect.objectContaining({ email: "novo@cliente.com", invited: true, status: "created" }) }),
    ]);
  });

  it("não cria conta nem envia convite se o registro inicial falha", async () => {
    const originalFrom = h.db.from.bind(h.db);
    vi.spyOn(h.db, "from").mockImplementation((table) => table === "admin_audit_log"
      ? Object.assign(originalFrom(table), {
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "boom" } }) }) }),
        }) as never
      : originalFrom(table));
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "parceiro" }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("nenhuma conta foi criada") });
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(h.db.tables.access_grants).toHaveLength(0);
  });

  it("o pedido já está registrado quando o Auth cria a conta", async () => {
    h.auth.admin.inviteUserByEmail.mockImplementationOnce(async () => {
      expect(h.db.tables.admin_audit_log).toEqual([expect.objectContaining({ action: "courtesy_invite", details: { email: "novo@cliente.com", status: "requested" } })]);
      return { data: { user: { id: NEW_USER } }, error: null };
    });
    expect(await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "parceiro" }))).toEqual({ ok: true });
  });

  it("limite de e-mails por admin por hora: convite e reenvio recusados acima do teto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 20; i++) {
      h.db.tables.admin_audit_log.push({
        id: i + 1000,
        admin_id: "user-1",
        action: i % 2 ? "invite_resend" : "courtesy_invite",
        target_user_id: null,
        details: i % 2 ? { mode: "invite" } : { email: `x${i}@y.com`, status: "requested" },
        created_at: new Date().toISOString(),
      });
    }
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "x" }));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Limite") });
    expect(await resendAccessAction(C1)).toEqual({ ok: false, error: expect.stringContaining("Limite") });
    expect(h.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("linhas antigas e de conclusão não contam para o limite", async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    for (let i = 0; i < 25; i++) {
      h.db.tables.admin_audit_log.push({ id: i + 2000, admin_id: "user-1", action: "invite_resend", target_user_id: null, details: {}, created_at: old });
      h.db.tables.admin_audit_log.push({ id: i + 3000, admin_id: "user-1", action: "courtesy_invite", target_user_id: null, details: { status: "created" }, created_at: new Date().toISOString() });
    }
    const r = await inviteWithCourtesyAction(form({ email: "novo@cliente.com", expiresAt: in30(), reason: "x" }));
    expect(r).toEqual({ ok: true });
  });
});
