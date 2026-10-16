import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { resendAccessEmail } from "@/lib/admin/access-email";
import { ADMIN_TARGET_ERROR } from "@/lib/admin/grants";

describe("resendAccessEmail", () => {
  let db: FakeSupabase;
  let auth: {
    admin: { getUserById: ReturnType<typeof vi.fn>; inviteUserByEmail: ReturnType<typeof vi.fn> };
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
  };
  const admin = () => ({ ...db.client, auth }) as never;
  const user = (last: string | null) => ({ data: { user: { id: "c1", email: "ana@cliente.com", last_sign_in_at: last } }, error: null });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://falow.app.br";
    db = createFakeAdmin();
    auth = {
      admin: {
        getUserById: vi.fn(async () => user(null)),
        inviteUserByEmail: vi.fn(async () => ({ data: { user: { id: "c1" } }, error: null })),
      },
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    };
  });

  it("quem nunca entrou recebe convite; audita mode invite", async () => {
    const r = await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "c1" });
    expect(r).toEqual({ ok: true });
    expect(auth.admin.inviteUserByEmail).toHaveBeenCalledWith("ana@cliente.com", { redirectTo: "https://falow.app.br/definir-senha" });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(db.tables.admin_audit_log).toEqual([
      expect.objectContaining({ admin_id: "user-1", action: "invite_resend", target_user_id: "c1", details: { mode: "invite" } }),
    ]);
  });

  it("quem já entrou recebe recuperação de senha; audita mode recovery", async () => {
    auth.admin.getUserById.mockResolvedValueOnce(user("2026-10-01T00:00:00Z"));
    const r = await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "c1" });
    expect(r).toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@cliente.com", { redirectTo: "https://falow.app.br/definir-senha" });
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(db.tables.admin_audit_log).toEqual([expect.objectContaining({ action: "invite_resend", details: { mode: "recovery" } })]);
  });

  it("alvo admin é recusado sem tocar no Auth nem no banco", async () => {
    const r = await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "user-1" });
    expect(r).toEqual({ ok: false, error: ADMIN_TARGET_ERROR });
    expect(auth.admin.getUserById).not.toHaveBeenCalled();
    expect(db.tables.admin_audit_log).toHaveLength(0);
  });

  it("usuário não encontrado ou sem e-mail devolve erro amigável", async () => {
    auth.admin.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "not found" } });
    expect((await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "c1" })).ok).toBe(false);
    auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { id: "c1", email: null, last_sign_in_at: null } }, error: null });
    expect((await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "c1" })).ok).toBe(false);
    expect(auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(db.tables.admin_audit_log).toHaveLength(0);
  });

  it("falha no envio devolve erro e não audita", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.admin.inviteUserByEmail.mockResolvedValueOnce({ data: { user: null }, error: { message: "rate limit" } });
    const r = await resendAccessEmail(admin(), { adminId: "user-1", targetUserId: "c1" });
    expect(r.ok).toBe(false);
    expect(db.tables.admin_audit_log).toHaveLength(0);
  });

  it("falha na auditoria avisa que o e-mail saiu mas o registro falhou", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = db.client;
    const failing = {
      ...real,
      auth,
      from: (t: string) => (t === "admin_audit_log" ? { insert: async () => ({ data: null, error: { message: "boom" } }) } : real.from(t as never)),
    };
    const r = await resendAccessEmail(failing as never, { adminId: "user-1", targetUserId: "c1" });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/e-mail foi enviado.*registro/i) });
    expect(auth.admin.inviteUserByEmail).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
