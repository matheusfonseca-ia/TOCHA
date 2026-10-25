import { describe, expect, it } from "vitest";

import { isAdminPath, routeFor } from "@/lib/auth/routing";

const anon = { loggedIn: false, hasAccess: false };
const lapsed = { loggedIn: true, hasAccess: false };
const paying = { loggedIn: true, hasAccess: true };

describe("routeFor", () => {
  it("páginas públicas abrem para qualquer um", () => {
    for (const p of ["/", "/privacidade", "/exclusao-de-dados", "/termos-de-servico", "/assinatura/obrigado", "/definir-senha"]) {
      expect(routeFor(p, anon)).toBe("next");
      expect(routeFor(p, lapsed)).toBe("next");
    }
  });
  it("sem login vai para /login", () => {
    expect(routeFor("/dashboard", anon)).toBe("/login");
    expect(routeFor("/assinatura", anon)).toBe("/login");
    expect(routeFor("/login", anon)).toBe("next");
  });
  it("logado sem acesso só vê /assinatura", () => {
    expect(routeFor("/dashboard", lapsed)).toBe("/assinatura");
    expect(routeFor("/crm/conversas", lapsed)).toBe("/assinatura");
    expect(routeFor("/assinatura", lapsed)).toBe("next");
    expect(routeFor("/login", lapsed)).toBe("/assinatura");
  });
  it("logado com acesso usa o painel", () => {
    expect(routeFor("/dashboard", paying)).toBe("next");
    expect(routeFor("/assinatura", paying)).toBe("next");
    expect(routeFor("/login", paying)).toBe("/dashboard");
  });
});

describe("isAdminPath", () => {
  it("reconhece /admin e subrotas", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/clientes")).toBe(true);
  });
  it("não confunde prefixos parecidos", () => {
    expect(isAdminPath("/administrativo")).toBe(false);
    expect(isAdminPath("/dashboard")).toBe(false);
  });
});
