import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: { id: "c1" } as { id: string } | null,
  cookies: new Map<string, string>(),
  exchange: vi.fn(), longToken: vi.fn(), profile: vi.fn(), subscribe: vi.fn(),
  createAdmin: vi.fn(), accountsError: null as { message: string } | null,
  hideFromGuard: false,
}));
vi.mock("next/headers", () => ({ cookies: () => ({
  get: (key: string) => h.cookies.has(key) ? { value: h.cookies.get(key) } : undefined,
  set: (key: string, value: string) => h.cookies.set(key, value),
  delete: (key: string | { name: string }) => h.cookies.delete(typeof key === "string" ? key : key.name),
}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({
  ...h.db.client, auth: { getUser: async () => ({ data: { user: h.user } }) },
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.createAdmin() }));
vi.mock("@/lib/crypto", () => ({ encryptToken: () => "encrypted" }));
vi.mock("@/lib/meta/graph", () => ({ subscribeAccountToWebhooks: (...args: unknown[]) => h.subscribe(...args) }));
vi.mock("@/lib/meta/oauth", () => ({
  META_OAUTH_COOKIE: "meta_oauth_state",
  META_OAUTH_COOKIE_PATH: "/sistema/api/auth/meta",
  getOAuthDialogUrl: (state: string) => `https://instagram.com/oauth?state=${state}`,
  exchangeCodeForToken: (...args: unknown[]) => h.exchange(...args),
  getLongLivedToken: (...args: unknown[]) => h.longToken(...args),
  getInstagramProfile: (...args: unknown[]) => h.profile(...args),
}));

import { GET as start } from "@/app/api/auth/meta/route";
import { GET as callback } from "@/app/api/auth/meta/callback/route";

function finish(startedBy: string | undefined = h.user?.id) {
  h.cookies.set("meta_oauth_state", `valid:${startedBy}`);
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
  h.hideFromGuard = false;
  h.exchange.mockResolvedValue({ token: "short" });
  h.longToken.mockResolvedValue({ token: "long", expiresIn: 3600 });
  h.profile.mockResolvedValue({ igUserId: "123", username: "ana", profilePictureUrl: null });
  h.subscribe.mockResolvedValue(undefined);
  h.createAdmin.mockImplementation(() => ({
    from: (table: string) => Object.assign(h.db.from(table as never), {
      // `.eq("status","active").or("ig_user_id.eq.X,user_id.eq.Y")` do guard.
      or: async (expr: string) => {
        const [, ig, uid] = /ig_user_id\.eq\.(\d+),user_id\.eq\.(.+)$/.exec(expr) ?? [];
        const data = h.hideFromGuard
          ? []
          : h.db.tables.ig_accounts.filter((a) => a.status === "active" && (a.ig_user_id === ig || a.user_id === uid));
        return { data, error: h.accountsError };
      },
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

  it("cookie de outro usuário (sessão trocou durante o OAuth): invalid_state, nada gravado", async () => {
    h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    expect((await finish("outro-usuario")).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?error=invalid_state");
    expect(h.exchange).not.toHaveBeenCalled();
  });

  it("início grava o cookie amarrado ao usuário", async () => {
    h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
    await start();
    expect(h.cookies.get("meta_oauth_state")).toMatch(/^[0-9a-f-]{36}:c1$/);
  });
});

describe("conexão: @ preso, limite e inscrição no webhook", () => {
  beforeEach(() => {
    h.db.tables.subscriptions.push({ user_id: "c1", status: "active" });
  });

  it("@ ativo de ex-cliente sem acesso é liberado e a conexão segue", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.db.tables.ig_accounts.push({ id: "acc-velha", user_id: "ex", ig_user_id: "123", status: "active", access_token_enc: "tok" });
    h.db.tables.subscriptions.push({ user_id: "ex", status: "canceled" });
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?connected=1");
    expect(h.db.tables.ig_accounts.find((a) => a.id === "acc-velha")).toMatchObject({ status: "disconnected", access_token_enc: "" });
    expect(h.db.tables.ig_accounts.find((a) => a.user_id === "c1")).toMatchObject({ status: "active", ig_user_id: "123" });
  });

  it("@ ativo de outro cliente com acesso continua bloqueando", async () => {
    h.db.tables.ig_accounts.push({ id: "acc-outro", user_id: "outro", ig_user_id: "123", status: "active", access_token_enc: "tok" });
    h.db.tables.subscriptions.push({ user_id: "outro", status: "active" });
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?error=account_taken");
    expect(h.db.tables.ig_accounts.find((a) => a.id === "acc-outro")!.status).toBe("active");
  });

  it("falha na inscrição do webhook: conecta, mas avisa com o id da conta", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.subscribe.mockRejectedValue(new Error("permissão"));
    const location = (await finish()).headers.get("location")!;
    const id = h.db.tables.ig_accounts[0].id;
    expect(location).toBe(`https://falow.app.br/sistema/accounts?connected=1&webhook=failed&account=${id}`);
  });

  it("dois callbacks simultâneos: a conta gravada por último é desfeita (limite reconferido)", async () => {
    // Outro callback do mesmo cliente gravou @999 depois da leitura do guard.
    h.hideFromGuard = true;
    h.db.tables.ig_accounts.push({ id: "acc-999", user_id: "c1", ig_user_id: "999", status: "active", access_token_enc: "tok" });
    expect((await finish()).headers.get("location")).toBe("https://falow.app.br/sistema/accounts?error=account_limit");
    expect(h.db.tables.ig_accounts.filter((a) => a.user_id === "c1" && a.status === "active").map((a) => a.id)).toEqual(["acc-999"]);
  });
});
