import Stripe from "stripe";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `stripe_events` com a PK de verdade (insert repetido = 23505) e falhas
 * injetáveis. O fake genérico não modela a PK desta tabela.
 */
function createEventsDb() {
  const ids = new Set<string>();
  const db = {
    ids,
    insertError: null as { message: string; code?: string } | null,
    deleteError: null as { message: string } | null,
    client: {
      from: (table: string) => {
        if (table !== "stripe_events") throw new Error(`tabela inesperada: ${table}`);
        return {
          insert: async ({ id }: { id: string }) => {
            if (db.insertError) return { error: db.insertError };
            if (ids.has(id)) return { error: { message: "duplicate key", code: "23505" } };
            ids.add(id);
            return { error: null };
          },
          delete: () => ({
            eq: async (_col: string, id: string) => {
              if (db.deleteError) return { error: db.deleteError };
              ids.delete(id);
              return { error: null };
            },
          }),
        };
      },
    },
  };
  return db;
}

const { state } = vi.hoisted(() => ({
  state: { db: null as unknown as ReturnType<typeof createEventsDb>, handle: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db.client }));
vi.mock("@/lib/billing/stripe-deps", () => ({ stripeEventDeps: () => ({}) }));
vi.mock("@/lib/billing/stripe-events", () => ({ handleStripeEvent: (...a: unknown[]) => state.handle(...a) }));

import { POST } from "@/app/api/webhooks/stripe/route";

const SECRET = "whsec_teste";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

function signed(body: string, signature?: string, headers: Record<string, string> = {}) {
  const header =
    signature ??
    Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return new NextRequest("https://falow.app.br/sistema/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": header, ...headers },
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    state.db = createEventsDb();
    state.handle = vi.fn(async () => ({ status: "processed" }));
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    vi.restoreAllMocks();
  });

  it("recusa assinatura inválida", async () => {
    const res = await POST(signed(payload, "t=1,v1=errado"));
    expect(res.status).toBe(400);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it("recusa corpo grande pelo Content-Length antes de ler (413)", async () => {
    const res = await POST(signed(payload, undefined, { "content-length": String(5 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it("recusa corpo grande mesmo sem Content-Length confiável", async () => {
    const big = "x".repeat(1024 * 1024 + 10);
    const res = await POST(signed(big, "t=1,v1=qualquer"));
    expect(res.status).toBe(413);
  });

  it("processa e grava o evento uma vez só", async () => {
    expect((await POST(signed(payload))).status).toBe(200);
    const second = await POST(signed(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    expect(state.handle).toHaveBeenCalledTimes(1);
    expect([...state.db.ids]).toEqual(["evt_1"]);
  });

  it("entregas simultâneas: só uma processa", async () => {
    let release!: () => void;
    state.handle = vi.fn(
      () => new Promise((resolve) => (release = () => resolve({ status: "processed" })))
    );
    const first = POST(signed(payload));
    // espera a primeira reservar o evento e entrar no handler
    await vi.waitFor(() => expect(state.handle).toHaveBeenCalledTimes(1));
    const second = await POST(signed(payload));
    expect(await second.json()).toEqual({ duplicate: true });
    release();
    expect((await first).status).toBe(200);
    expect(state.handle).toHaveBeenCalledTimes(1);
  });

  it("retry responde 500 e libera a reserva para a reentrega", async () => {
    state.handle = vi.fn(async () => ({ status: "retry", reason: "x" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await POST(signed(payload))).status).toBe(500);
    expect(state.db.ids.size).toBe(0);
    state.handle = vi.fn(async () => ({ status: "processed" }));
    expect((await POST(signed(payload))).status).toBe(200);
    expect(state.handle).toHaveBeenCalledTimes(1);
  });

  it("exceção no handler responde 500 e libera a reserva", async () => {
    state.handle = vi.fn(async () => {
      throw new Error("boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(signed(payload))).status).toBe(500);
    expect(state.db.ids.size).toBe(0);
  });

  it("erro do banco ao reservar não vira 'não visto': 500 sem processar", async () => {
    state.db.insertError = { message: "banco fora" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(signed(payload))).status).toBe(500);
    expect(state.handle).not.toHaveBeenCalled();
  });
});
