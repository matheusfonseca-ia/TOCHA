import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { handleStripeEvent, type StripeEventDeps } from "@/lib/billing/stripe-events";

const NOW = new Date("2026-10-15T12:00:00Z");
const PERIOD_END = 1_800_000_000; // segundos

function sub(id: string, status: Stripe.Subscription.Status, customer = "cus_1"): Stripe.Subscription {
  return {
    id,
    status,
    customer,
    items: { data: [{ current_period_end: PERIOD_END }] },
  } as unknown as Stripe.Subscription;
}

function evt(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${Math.random()}`, type, data: { object } } as unknown as Stripe.Event;
}

function checkout(overrides: Record<string, unknown> = {}) {
  return evt("checkout.session.completed", {
    mode: "subscription",
    customer: "cus_1",
    subscription: "sub_1",
    customer_details: { email: "Cliente@Exemplo.com" },
    ...overrides,
  });
}

describe("handleStripeEvent", () => {
  let db: FakeSupabase;
  let deps: StripeEventDeps;
  let subs: Record<string, Stripe.Subscription>;

  beforeEach(() => {
    db = createFakeAdmin();
    subs = { sub_1: sub("sub_1", "active") };
    deps = {
      admin: db.client,
      retrieveSubscription: vi.fn(async (id: string) => subs[id]),
      findUserIdByEmail: vi.fn(async () => null),
      inviteUser: vi.fn(async () => "novo-user"),
      now: () => NOW,
    };
  });

  it("checkout de e-mail novo convida e grava a assinatura", async () => {
    const result = await handleStripeEvent(checkout(), deps);
    expect(result).toEqual({ status: "processed" });
    expect(deps.inviteUser).toHaveBeenCalledWith("Cliente@Exemplo.com");
    expect(db.tables.subscriptions).toEqual([
      expect.objectContaining({
        user_id: "novo-user",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        status: "active",
        current_period_end: new Date(PERIOD_END * 1000).toISOString(),
        canceled_at: null,
        purge_after: null,
      }),
    ]);
  });

  it("checkout de e-mail existente reaproveita o usuário", async () => {
    deps.findUserIdByEmail = vi.fn(async () => "user-existente");
    await handleStripeEvent(checkout(), deps);
    expect(deps.inviteUser).not.toHaveBeenCalled();
    expect(db.tables.subscriptions[0].user_id).toBe("user-existente");
  });

  it("reativação pelo mesmo cliente acha o usuário pela linha e zera a exclusão", async () => {
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_velha",
      status: "canceled",
      canceled_at: "2026-10-01T00:00:00Z",
      purge_after: "2026-10-31T00:00:00Z",
    });
    subs.sub_2 = sub("sub_2", "active");
    await handleStripeEvent(checkout({ subscription: "sub_2" }), deps);
    expect(deps.findUserIdByEmail).not.toHaveBeenCalled();
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      user_id: "cliente-1",
      stripe_subscription_id: "sub_2",
      status: "active",
      canceled_at: null,
      purge_after: null,
    });
  });

  it("compra repetida de quem já tem assinatura ativa: fica a nova e avisa no log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_velho",
      stripe_subscription_id: "sub_velha",
      status: "active",
    });
    deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
    subs.sub_nova = sub("sub_nova", "active", "cus_novo");
    await handleStripeEvent(checkout({ customer: "cus_novo", subscription: "sub_nova" }), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({ stripe_subscription_id: "sub_nova", stripe_customer_id: "cus_novo" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("sub_velha"));
    errorSpy.mockRestore();
  });

  it("checkout sem e-mail pede reenvio", async () => {
    const result = await handleStripeEvent(checkout({ customer_details: null, customer_email: null }), deps);
    expect(result.status).toBe("retry");
  });

  it("checkout que não é de assinatura é ignorado", async () => {
    expect(await handleStripeEvent(checkout({ mode: "payment" }), deps)).toEqual({ status: "ignored" });
  });

  it("updated de cliente desconhecido pede reenvio (chegou antes do checkout)", async () => {
    const result = await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "active")), deps);
    expect(result.status).toBe("retry");
  });

  it("updated muda status e período", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "past_due")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({ status: "past_due", purge_after: null });
  });

  it("deleted marca cancelada e agenda exclusão para 30 dias", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    });
  });

  it("evento de assinatura antiga não derruba a nova", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_2", status: "active" });
    const result = await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(result).toEqual({ status: "ignored" });
    expect(db.tables.subscriptions[0].status).toBe("active");
  });

  it("tipo de evento desconhecido é ignorado", async () => {
    expect(await handleStripeEvent(evt("invoice.paid", {}), deps)).toEqual({ status: "ignored" });
  });
});
