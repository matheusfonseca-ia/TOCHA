// /assinatura: uma falha ao ler a assinatura não pode virar "Sem assinatura" + "Reativar"
// (o cliente que paga abriria uma segunda assinatura). Supabase mockado.
import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O transform do vitest usa o runtime clássico de JSX (React.createElement sem import);
// a página conta com o runtime automático do Next. Mesmo truque de ui-qa.test.ts.
(globalThis as unknown as { React: typeof React }).React = React;

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "c1" } as { id: string } | null,
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
    grant: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "access_grants"
              ? { data: state.grant, error: null }
              : state.error
                ? { data: null, error: state.error }
                : { data: state.row, error: null },
        }),
      }),
    }),
  }),
}));

vi.mock("@/app/login/actions", () => ({ signOut: async () => {} }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import AssinaturaPage from "@/app/assinatura/page";

async function render() {
  return renderToString(await AssinaturaPage());
}

describe("/assinatura", () => {
  beforeEach(() => {
    state.user = { id: "c1" };
    state.row = null;
    state.error = null;
    state.grant = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falha ao ler a assinatura: mensagem neutra, Tentar de novo e Sair, sem Reativar nem Gerenciar", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.error = { message: "boom" };
    const html = await render();
    expect(html).toContain("Não foi possível conferir sua assinatura agora. Tente de novo em instantes.");
    expect(html).toContain("Tentar de novo");
    expect(html).toContain('href="/assinatura"');
    expect(html).toContain("Sair");
    expect(html).not.toContain("Reativar");
    expect(html).not.toContain("Gerenciar");
    expect(html).not.toContain("Sem assinatura");
    expect(html).not.toContain("/api/billing/checkout");
    expect(html).not.toContain("/api/billing/portal");
    expect(consoleError).toHaveBeenCalledWith("[assinatura] falha ao ler a assinatura:", "boom");
  });

  it("sem linha e sem erro: Sem assinatura + Reativar, sem console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render();
    expect(html).toContain("Sem assinatura");
    expect(html).toContain("Reativar assinatura");
    expect(html).not.toContain("Não foi possível conferir");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("ativa: Gerenciar na Stripe, sem Reativar", async () => {
    state.row = { status: "active", purge_after: null };
    const html = await render();
    expect(html).toContain("Gerenciar na Stripe");
    expect(html).not.toContain("Reativar");
  });

  it("conta bloqueada: avisa e não oferece Reativar nem Gerenciar", async () => {
    state.row = { status: "active" };
    state.grant = { user_id: "c1", kind: "block", expires_at: null };
    const html = await render();
    expect(html).toContain("Conta bloqueada");
    expect(html).toContain("Sair");
    expect(html).not.toContain("Reativar");
    expect(html).not.toContain("Gerenciar");
  });

  it("cortesia válida: mostra a data e o botão do painel", async () => {
    state.grant = { user_id: "c1", kind: "courtesy", expires_at: "2999-01-01T12:00:00Z" };
    const html = await render();
    expect(html).toContain("Cortesia válida até");
    expect(html).toContain("Ir para o painel");
    expect(html).not.toContain("Reativar");
  });
});
