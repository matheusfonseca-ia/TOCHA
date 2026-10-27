import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: { id: "c1" } as { id: string } | null,
  cookies: new Map<string, string>(),
  exchange: vi.fn(), longToken: vi.fn(), profile: vi.fn(), subscribe: vi.fn(),
  createAdmin: vi.fn(), accountsError: null as { message: string } | null,
}));
vi.mock("next/headers", () => ({ cookies: () => ({
  get: (key: string) => h.cookies.has(key) ? { value: h.cookies.get(key) } : undefined,
  set: (key: string, value: string) => h.cookies.set(key, value),
  delete: (key: string) => h.cookies.delete(key),
}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  ...h.db.client, auth: { getUser: async () => ({ data: { user: h.user } }) },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.createAdmin() }));
vi.mock("@/lib/crypto", () => ({ encryptToken: () => "encrypted" }));
vi.mock("@/lib/meta/graph", () => ({ subscribeAccountToWebhooks: (...args: unknown[]) => h.subscribe(...args) }));
vi.mock("@/lib/meta/oauth", () => ({
  getOAuthDialogUrl: (state: string) => `https://instagram.com/oauth?state=${state}`,
  exchangeCodeForToken: (...args: unknown[]) => h.exchange(...args),
  getLongLivedToken: (...args: unknown[]) => h.longToken(...args),
  getInstagramProfile: (...args: unknown[]) => h.profile(...args),
}));

import { GET as start } from "@/app/api/auth/meta/route";
import { GET as callback } from "@/app/api/auth/meta/callback/route";

function finish() {
  h.cookies.set("meta_oauth_state", "valid");
  return callback(new NextRequest("https://falow.app.br/sistema/api/auth/meta/callback?state=valid&code=code"));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://falow.app.br/sistema";
  h.db = createFakeAdmin();
  h.user = { id: "c1" };
  h.cookies.clear();
  h.accountsError = null;
  h.exchange.mockResolvedValue({ token: "short" });
  h.longToken.mockResolvedValue({ token: "long", expiresIn: 3600 });
  h.profile.mockResolvedValue({ igUserId: "123", username: "ana", profilePictureUrl: null });
  h.subscribe.mockResolvedValue(undefined);
  h.createAdmin.mockImplementation(() => ({
    from: (table: string) => Object.assign(h.db.from(table as never), {
      or: async () => ({ data: [], error: h.accountsError }),
    }),
  }));
});

describe("acesso nas rotas OAuth do Instagram", () => {
  it("sem login redireciona ao login nas duas rotas", async () => {
    h.user = null;
    expect((await start()).headers.get("location")).toBe("https://falow.app.br/sistema/login");
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/login");
    expect(h.exchange).not.toHaveBeenCalled();
  });

  it.each(["block", "none", "expired"])("recusa %s antes do diálogo e antes de trocar tokens", async (kind) => {
    if (kind !== "none") h.db.tables.access_grants.push({ user_id: "c1", kind: kind === "block" ? "block" : "courtesy", expires_at: "2000-01-01T00:00:00Z" });
    if (kind === "block") h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    expect((await start()).headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(h.cookies.size).toBe(0);
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.createAdmin).not.toHaveBeenCalled();
    expect(h.db.tables.ig_accounts).toHaveLength(0);
  });

  it.each(["subscription", "courtesy", "admin"])("permite %s e salva a conexão", async (kind) => {
    if (kind === "subscription") h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    if (kind === "courtesy") h.db.tables.access_grants.push({ user_id: "c1", kind: "courtesy", expires_at: "2999-01-01T00:00:00Z" });
    if (kind === "admin") h.user = { id: "user-1" };
    expect((await start()).headers.get("location")).toMatch(/^https:\/\/instagram.com\/oauth/);
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?connected=1");
    expect(h.db.tables.ig_accounts).toEqual([expect.objectContaining({ user_id: h.user!.id, ig_username: "ana", status: "active" })]);
  });

  it("bloqueio aplicado durante o OAuth impede o callback de conectar", async () => {
    h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    await start();
    h.db.tables.access_grants.push({ user_id: "c1", kind: "block" });
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(h.exchange).not.toHaveBeenCalled();
    expect(h.cookies.size).toBe(0);
  });

  it("falha ao conferir contas já conectadas impede inscrição e escrita", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    h.accountsError = { message: "indisponível" };
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?error=exchange_failed");
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.db.tables.ig_accounts).toHaveLength(0);
  });
});
