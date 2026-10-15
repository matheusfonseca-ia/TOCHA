// Porta de entrada do produto: quem passa, quem vai para /login e quem vai para /assinatura.
// Supabase mockado; a decisão pura de rota está em src/lib/auth/routing.test.ts.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, createServerClient } = vi.hoisted(() => {
  const state = {
    user: null as null | { id: string },
    sub: null as null | { status: string },
    fromCalls: [] as string[],
  };
  const createServerClient = vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.fromCalls.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: state.sub, error: null }),
      };
      return chain;
    },
  }));
  return { state, createServerClient };
});

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { middleware } from "@/middleware";

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
    state.fromCalls = [];
    createServerClient.mockClear();
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
    expect(state.fromCalls[0]).toBe("subscriptions");
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
});
