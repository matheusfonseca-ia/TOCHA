import { describe, expect, it } from "vitest";

import { checkoutDecision } from "@/lib/billing/checkout";

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
});
