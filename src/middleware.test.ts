// Porta de entrada do produto: quem passa, quem vai para /login e quem vai para /assinatura.
// Supabase mockado; a decisão pura de rota está em src/lib/auth/routing.test.ts.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, createServerClient } = vi.hoisted(() => {
  const state = {
    user: null as null | { id: string },
    sub: null as null | { status: string },
    grant: null as null | { user_id: string; kind: string; expires_at: string | null },
    error: null as null | { message: string },
    fromCalls: [] as string[],
    aal: { currentLevel: "aal1", nextLevel: "aal1" } as { currentLevel: string; nextLevel: string },
    /** Cookies que o getUser() "renovou" nesta requisição (setAll do @supabase/ssr). */
    refreshed: null as null | { name: string; value: string },
  };
  type SetAll = (c: { name: string; value: string; options: Record<string, unknown> }[]) => void;
  const createServerClient = vi.fn((_url: string, _key: string, opts: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getUser: async () => {
        if (state.refreshed) opts.cookies.setAll([{ ...state.refreshed, options: { path: "/" } }]);
        return { data: { user: state.user } };
      },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null }) },
    },
    from: (table: string) => {
      state.fromCalls.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "access_grants") return { data: state.grant ?? null, error: null };
          return state.error ? { data: null, error: state.error } : { data: state.sub, error: null };
        },
      };
      return chain;
    },
  }));
  return { state, createServerClient };
});

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { config, middleware } from "@/middleware";

function req(path: string) {
  return new NextRequest(`https://falow.app.br${path}`);
}
const isNext = (r: Response) => r.headers.get("x-middleware-next") === "1";
const location = (r: Response) => {
  const l = r.headers.get("location");
  return l ? new URL(l) : null;
};

describe("middleware", () => {
  beforeEach(() => {
    state.user = null;
    state.sub = null;
    state.grant = null;
    state.error = null;
    state.fromCalls = [];
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
    state.refreshed = null;
    createServerClient.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("atalhos publicos e /api nao tocam no Supabase", async () => {
    for (const p of ["/", "/privacidade", "/exclusao-de-dados", "/termos-de-servico", "/assinatura/obrigado", "/definir-senha?token_hash=abc&type=invite", "/api/billing/checkout", "/api/webhooks/stripe"]) {
      const r = await middleware(req(p));
      expect(isNext(r), p).toBe(true);
    }
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("anonimo vai para /login (e /login abre)", async () => {
    const r = await middleware(req("/dashboard?x=1"));
    expect(r.status).toBe(307);
    expect(location(r)?.pathname).toBe("/login");
    expect(location(r)?.search).toBe("");
    expect(isNext(await middleware(req("/login")))).toBe(true);
    expect(state.fromCalls).toEqual([]);
  });

  it("dono tem acesso sem consultar assinatura", async () => {
    state.user = { id: "user-1" };
    expect(isNext(await middleware(req("/dashboard")))).toBe(true);
    expect(state.fromCalls).toEqual([]);
    const r = await middleware(req("/login"));
    expect(location(r)?.pathname).toBe("/dashboard");
  });

  it.each(["active", "trialing", "past_due"])("status %s tem acesso", async (status) => {
    state.user = { id: "u2" };
    state.sub = { status };
    expect(isNext(await middleware(req("/dashboard")))).toBe(true);
    expect(isNext(await middleware(req("/crm/conversas")))).toBe(true);
    expect(state.fromCalls.slice(0, 2)).toEqual(["access_grants", "subscriptions"]);
    expect(location(await middleware(req("/login")))?.pathname).toBe("/dashboard");
  });

  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", ""])("status '%s' sem acesso vai para /assinatura", async (status) => {
    state.user = { id: "u2" };
    state.sub = { status };
    const r = await middleware(req("/dashboard?x=1"));
    expect(r.status).toBe(307);
    expect(location(r)?.pathname).toBe("/assinatura");
    expect(location(r)?.search).toBe("");
    expect(isNext(await middleware(req("/assinatura")))).toBe(true);
    expect(location(await middleware(req("/login")))?.pathname).toBe("/assinatura");
  });

  it("logado sem linha em subscriptions e sem acesso", async () => {
    state.user = { id: "u3" };
    state.sub = null;
    expect(location(await middleware(req("/rules")))?.pathname).toBe("/assinatura");
    expect(isNext(await middleware(req("/assinatura")))).toBe(true);
    // paginas publicas continuam abrindo
    expect(isNext(await middleware(req("/definir-senha")))).toBe(true);
    expect(isNext(await middleware(req("/assinatura/obrigado")))).toBe(true);
  });

  it("erro na consulta de subscriptions: continua fechado (vai para /assinatura) e registra o erro", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "u4" };
    state.error = { message: "boom" };
    const r = await middleware(req("/dashboard"));
    expect(r.status).toBe(307);
    expect(location(r)?.pathname).toBe("/assinatura");
    expect(consoleError).toHaveBeenCalledWith("[access] falha ao ler subscriptions do usuário u4:", "boom");
  });

  it("sem erro na consulta nao registra nada no console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "u4" };
    state.sub = null;
    await middleware(req("/dashboard"));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("não-admin em /admin recebe 404 (rewrite), sem redirecionar", async () => {
    state.user = { id: "u2" };
    state.sub = { status: "active" };
    const r = await middleware(req("/admin/clientes"));
    expect(r.headers.get("x-middleware-rewrite")).toContain("/404");
    expect(r.headers.get("location")).toBeNull();
  });

  it("anônimo em /admin vai para /login como qualquer área logada", async () => {
    const r = await middleware(req("/admin"));
    expect(location(r)?.pathname).toBe("/login");
  });

  it("admin (dono) entra em /admin", async () => {
    state.user = { id: "user-1" };
    expect(isNext(await middleware(req("/admin")))).toBe(true);
  });

  it("cliente bloqueado vai para /assinatura mesmo com assinatura ativa", async () => {
    state.user = { id: "u3" };
    state.sub = { status: "active" };
    state.grant = { user_id: "u3", kind: "block", expires_at: null };
    expect(location(await middleware(req("/dashboard")))?.pathname).toBe("/assinatura");
  });

  it("cortesia vencida vai para /assinatura; válida entra", async () => {
    state.user = { id: "u4" };
    state.grant = { user_id: "u4", kind: "courtesy", expires_at: "2000-01-01T00:00:00Z" };
    expect(location(await middleware(req("/dashboard")))?.pathname).toBe("/assinatura");
    state.grant = { user_id: "u4", kind: "courtesy", expires_at: "2999-01-01T00:00:00Z" };
    expect(isNext(await middleware(req("/dashboard")))).toBe(true);
  });

  it("/assinatura abre sem consultar access_grants/subscriptions", async () => {
    state.user = { id: "u2" };
    expect(isNext(await middleware(req("/assinatura")))).toBe(true);
    expect(state.fromCalls).toEqual([]);
  });

  it("redirect leva junto os cookies renovados pelo getUser()", async () => {
    state.user = { id: "u2" };
    state.refreshed = { name: "sb-x-auth-token", value: "novo" };
    const r = await middleware(req("/dashboard"));
    expect(location(r)?.pathname).toBe("/assinatura");
    expect(r.headers.get("set-cookie")).toContain("sb-x-auth-token=novo");
  });

  it("rewrite 404 do /admin também leva os cookies renovados", async () => {
    state.user = { id: "u2" };
    state.refreshed = { name: "sb-x-auth-token", value: "novo" };
    const r = await middleware(req("/admin"));
    expect(r.headers.get("x-middleware-rewrite")).toContain("/404");
    expect(r.headers.get("set-cookie")).toContain("sb-x-auth-token=novo");
  });

  describe("segundo fator do /admin", () => {
    it("admin com fator cadastrado e sessão só de senha vai para /admin/mfa", async () => {
      state.user = { id: "user-1" };
      state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
      expect(location(await middleware(req("/admin/clientes")))?.pathname).toBe("/admin/mfa");
      expect(isNext(await middleware(req("/admin/mfa")))).toBe(true);
    });

    it("FALOW_ADMIN_REQUIRE_MFA=true exige aal2 mesmo sem fator cadastrado", async () => {
      vi.stubEnv("FALOW_ADMIN_REQUIRE_MFA", "true");
      state.user = { id: "user-1" };
      expect(location(await middleware(req("/admin")))?.pathname).toBe("/admin/mfa");
      state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
      expect(isNext(await middleware(req("/admin")))).toBe(true);
    });

    it("sem a variável e sem fator: admin entra só com senha (padrão, não tranca o dono)", async () => {
      state.user = { id: "user-1" };
      expect(isNext(await middleware(req("/admin")))).toBe(true);
    });

    it("o painel do cliente não exige segundo fator", async () => {
      vi.stubEnv("FALOW_ADMIN_REQUIRE_MFA", "true");
      state.user = { id: "user-1" };
      expect(isNext(await middleware(req("/dashboard")))).toBe(true);
    });
  });
});

describe("matcher do middleware", () => {
  const pattern = new RegExp(`^${config.matcher[0]}$`);
  it("pula só os arquivos do build e os ícones da raiz", () => {
    for (const p of ["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/icon.svg"]) {
      expect(pattern.test(p), p).toBe(false);
    }
  });
  it("caminho do painel terminado em extensão de imagem passa pelo middleware", () => {
    for (const p of ["/rules/sequencias/x.png", "/dashboard", "/rules/a.svg", "/admin/x.ico", "/icon.svg/x"]) {
      expect(pattern.test(p), p).toBe(true);
    }
  });
});
