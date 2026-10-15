import Stripe from "stripe";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state } = vi.hoisted(() => ({ state: { db: null as unknown, handle: vi.fn() } }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => (state.db as FakeSupabase).client }));
vi.mock("@/lib/billing/stripe-deps", () => ({ stripeEventDeps: () => ({}) }));
vi.mock("@/lib/billing/stripe-events", () => ({ handleStripeEvent: (...a: unknown[]) => state.handle(...a) }));

import { POST } from "@/app/api/webhooks/stripe/route";

const SECRET = "whsec_teste";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

function signed(body: string, signature?: string) {
  const header =
    signature ??
    Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return new NextRequest("https://falow.app.br/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": header },
  });
}

describe("POST /api/webhooks/stripe", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.db = db;
    state.handle = vi.fn(async () => ({ status: "processed" }));
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
  });

  it("recusa assinatura inválida", async () => {
    const res = await POST(signed(payload, "t=1,v1=errado"));
    expect(res.status).toBe(400);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it("processa e grava o evento uma vez só", async () => {
    expect((await POST(signed(payload))).status).toBe(200);
    expect((await POST(signed(payload))).status).toBe(200);
    expect(state.handle).toHaveBeenCalledTimes(1);
    expect(db.tables.stripe_events.map((e) => e.id)).toEqual(["evt_1"]);
  });

  it("retry responde 500 e não marca o evento", async () => {
    state.handle = vi.fn(async () => ({ status: "retry", reason: "x" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(signed(payload))).status).toBe(500);
    expect(db.tables.stripe_events).toHaveLength(0);
  });
});
