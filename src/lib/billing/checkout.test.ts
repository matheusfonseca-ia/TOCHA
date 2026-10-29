import { describe, expect, it } from "vitest";

import { checkoutDecision, hasOpenSubscription, isSameOriginRequest } from "@/lib/billing/checkout";

describe("checkoutDecision", () => {
  it("visitante sem login vai para checkout novo", () => {
    expect(checkoutDecision({ userId: null, owner: false, subscription: null })).toEqual({ kind: "checkout" });
  });
  it("logado com assinatura ativa não compra de novo", () => {
    expect(
      checkoutDecision({ userId: "c1", owner: false, subscription: { status: "active", stripe_customer_id: "cus_1" } })
    ).toEqual({ kind: "dashboard" });
  });
  it("dono nunca vai para checkout", () => {
    expect(checkoutDecision({ userId: "user-1", owner: true, subscription: null })).toEqual({ kind: "dashboard" });
  });
  it("cancelado reativa com o mesmo cliente da Stripe", () => {
    expect(
      checkoutDecision({ userId: "c1", owner: false, subscription: { status: "canceled", stripe_customer_id: "cus_1" } })
    ).toEqual({ kind: "checkout", customer: "cus_1" });
  });
  it("bloqueado não vai para checkout, nem com assinatura ativa", () => {
    expect(checkoutDecision({ userId: "c1", owner: false, blocked: true, subscription: null })).toEqual({ kind: "blocked" });
    expect(
      checkoutDecision({ userId: "c1", owner: false, blocked: true, subscription: { status: "active", stripe_customer_id: "cus_1" } })
    ).toEqual({ kind: "blocked" });
  });
});

describe("hasOpenSubscription", () => {
  it("incomplete, unpaid, past_due e paused ainda cobram", () => {
    for (const s of ["incomplete", "unpaid", "past_due", "paused", "active"]) expect(hasOpenSubscription([s])).toBe(true);
  });
  it("só encerradas: pode abrir Checkout", () => {
    expect(hasOpenSubscription(["canceled", "incomplete_expired"])).toBe(false);
    expect(hasOpenSubscription([])).toBe(false);
  });
});

describe("isSameOriginRequest", () => {
  const app = "https://falow.app.br/sistema/";
  const h = (init: Record<string, string>) => new Headers(init);
  it("Origin igual passa, diferente ou parecido não", () => {
    expect(isSameOriginRequest(h({ origin: "https://falow.app.br" }), app)).toBe(true);
    expect(isSameOriginRequest(h({ origin: "https://evil.example" }), app)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "https://sub.falow.app.br" }), app)).toBe(false);
    expect(isSameOriginRequest(h({ origin: "null" }), app)).toBe(false);
  });
  it("sem Origin: Sec-Fetch-Site e depois Referer", () => {
    expect(isSameOriginRequest(h({ "sec-fetch-site": "same-origin" }), app)).toBe(true);
    expect(isSameOriginRequest(h({ "sec-fetch-site": "cross-site" }), app)).toBe(false);
    expect(isSameOriginRequest(h({ referer: "https://falow.app.br/" }), app)).toBe(true);
    expect(isSameOriginRequest(h({ referer: "https://evil.example/x" }), app)).toBe(false);
    expect(isSameOriginRequest(h({}), app)).toBe(false);
  });
});
