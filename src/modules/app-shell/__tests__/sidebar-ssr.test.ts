import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// O vitest do projeto compila JSX no modo clássico (React.createElement)
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ usePathname: () => "/crm" }));
// String no lugar da server action: o react-dom puro (fora do Next) só
// aceita string no action do <form>
vi.mock("@/app/login/actions", () => ({ signOut: "/logout" }));

import { AppShellProvider, Sidebar } from "..";

function render(
  initialCollapsed: boolean,
  crmUnread = 0,
  extra: { showAdmin?: boolean; showBilling?: boolean } = {}
) {
  return renderToStaticMarkup(
    createElement(AppShellProvider, {
      initialCollapsed,
      children: createElement(Sidebar, {
        userEmail: "ana@falow.com.br",
        crmUnread,
        ...extra,
      }),
    })
  );
}

// O primeiro quadro sai do servidor já no estado do cookie: é o CSS a partir
// do data-sidebar que decide o que aparece, sem esperar o JS.
describe("Sidebar (SSR)", () => {
  it("renderiza recolhida e aberta conforme o estado inicial", () => {
    expect(render(true)).toContain('data-sidebar="collapsed"');
    expect(render(false)).toContain('data-sidebar="expanded"');
  });

  it("tem os dois controles acessíveis de alternar", () => {
    const html = render(false);
    expect(html).toContain('aria-label="Recolher menu"');
    expect(html).toContain('aria-label="Expandir menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="app-sidebar"');
    expect(html).toContain('aria-keyshortcuts="Control+B"');
  });

  it("marca o item ativo e mostra não lidas na pílula e na bolinha", () => {
    const html = render(true, 12);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="12 não lidas"');
    expect(html).toContain(">9+<");
  });

  it("cliente vê Minha assinatura (portal da Stripe) e não vê Admin", () => {
    const html = render(false, 0, { showBilling: true });
    expect(html).toContain('action="/sistema/api/billing/portal"');
    expect(html).toContain("Minha assinatura");
    expect(html).not.toContain('href="/admin"');
  });

  it("admin vê o link do /admin e não vê Minha assinatura", () => {
    const html = render(true, 0, { showAdmin: true });
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain("/api/billing/portal");
  });

  it("não usa travessão em nenhum texto", () => {
    // travessão (U+2014) e meia-risca (U+2013), por código pra não pôr o
    // próprio caractere no arquivo
    const dashes = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
    expect(render(false, 3)).not.toMatch(dashes);
  });
});
