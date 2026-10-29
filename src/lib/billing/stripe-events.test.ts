import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { QueryClient } from "@/lib/billing/access";
import { createFakeAdmin, type FakeSupabase, type TableName } from "@/lib/sequences/__tests__/fake-supabase";
import { handleStripeEvent, type StripeEventDeps } from "@/lib/billing/stripe-events";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY_MS = 86_400_000;
const PURGE_AT = new Date(NOW.getTime() + 30 * DAY_MS).toISOString();
const PERIOD_END = 1_800_000_000; // segundos
const PERIOD_END_ISO = new Date(PERIOD_END * 1000).toISOString();

/** `priceId` vai em `items.data[0].price.id` (sem ele, o item não tem preço). */
function sub(
  id: string,
  status: Stripe.Subscription.Status,
  customer = "cus_1",
  periodEnd = PERIOD_END,
  priceId?: string
): Stripe.Subscription {
  return {
    id,
    status,
    customer,
    items: { data: [{ current_period_end: periodEnd, ...(priceId ? { price: { id: priceId } } : {}) }] },
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

/**
 * Admin que falha só nas leituras de `subscriptions` filtradas por `column`
 * (o `maybeSingle` devolve erro); todo o resto vai para o fake de verdade.
 */
function failingRead(db: FakeSupabase, column: string): QueryClient {
  return {
    from: (table: TableName) => {
      const builder = db.from(table);
      if (table !== "subscriptions") return builder;
      let filtered = false;
      const eq = builder.eq.bind(builder);
      builder.eq = (col, value) => {
        if (col === column) filtered = true;
        return eq(col, value);
      };
      const maybeSingle = builder.maybeSingle.bind(builder);
      builder.maybeSingle = (async () =>
        filtered ? { data: null, error: { message: "boom" } } : maybeSingle()) as typeof builder.maybeSingle;
      return builder;
    },
  };
}

describe("handleStripeEvent", () => {
  let db: FakeSupabase;
  let deps: StripeEventDeps;
  let subs: Record<string, Stripe.Subscription>;
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
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

  it("compra repetida de quem já tem assinatura ativa: a linha fica intacta e avisa no log", async () => {
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_velho",
      stripe_subscription_id: "sub_velha",
      status: "active",
    });
    deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
    subs.sub_nova = sub("sub_nova", "active", "cus_novo");

    const result = await handleStripeEvent(checkout({ customer: "cus_novo", subscription: "sub_nova" }), deps);

    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions).toEqual([
      {
        user_id: "cliente-1",
        stripe_customer_id: "cus_velho",
        stripe_subscription_id: "sub_velha",
        status: "active",
      },
    ]);
    // A assinatura nova é recuperada (para conferir o preço) antes de achar o usuário,
    // mas a linha continua intacta.
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_nova");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain("sub_velha");
    expect(message).toContain("sub_nova");
    expect(message).toContain("cus_velho");
    expect(message).toContain("cus_novo");
  });

  it.each(["trialing", "past_due"] as const)(
    "compra repetida com a linha em %s também não toca na linha",
    async (status) => {
      db.tables.subscriptions.push({
        user_id: "cliente-1",
        stripe_customer_id: "cus_velho",
        stripe_subscription_id: "sub_velha",
        status,
      });
      deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
      subs.sub_nova = sub("sub_nova", "active", "cus_novo");

      const result = await handleStripeEvent(checkout({ customer: "cus_novo", subscription: "sub_nova" }), deps);

      expect(result).toEqual({ status: "processed" });
      expect(db.tables.subscriptions).toHaveLength(1);
      expect(db.tables.subscriptions[0]).toMatchObject({
        stripe_customer_id: "cus_velho",
        stripe_subscription_id: "sub_velha",
        status,
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    }
  );

  // unpaid/incomplete/paused ainda estão vivas na Stripe: não religa pelo e-mail (ver teste "assinatura viva" abaixo).
  it.each(["canceled", "incomplete_expired"] as const)(
    "quem está com a assinatura encerrada (%s) volta pela landing com cliente Stripe novo e religa a mesma conta",
    async (status) => {
      db.tables.subscriptions.push({
        user_id: "cliente-1",
        stripe_customer_id: "cus_velho",
        stripe_subscription_id: "sub_velha",
        status,
        canceled_at: "2026-10-01T00:00:00Z",
        purge_after: "2026-10-31T00:00:00Z",
      });
      deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
      subs.sub_nova = sub("sub_nova", "active", "cus_novo");

      const result = await handleStripeEvent(checkout({ customer: "cus_novo", subscription: "sub_nova" }), deps);

      expect(result).toEqual({ status: "processed" });
      expect(errorSpy).not.toHaveBeenCalled();
      expect(db.tables.subscriptions).toHaveLength(1);
      expect(db.tables.subscriptions[0]).toMatchObject({
        user_id: "cliente-1",
        stripe_customer_id: "cus_novo",
        stripe_subscription_id: "sub_nova",
        status: "active",
        canceled_at: null,
        purge_after: null,
      });
    }
  );

  it("reentrega do mesmo checkout é idempotente: atualiza a linha e não acusa compra repetida", async () => {
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      status: "trialing",
      current_period_end: "2026-11-01T00:00:00.000Z",
    });

    const result = await handleStripeEvent(checkout(), deps);

    expect(result).toEqual({ status: "processed" });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      user_id: "cliente-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      status: "active",
      current_period_end: PERIOD_END_ISO,
      canceled_at: null,
      purge_after: null,
      updated_at: NOW.toISOString(),
    });
  });

  it("checkout de e-mail novo entregue duas vezes convida uma vez só e deixa uma linha", async () => {
    await handleStripeEvent(checkout(), deps);
    const result = await handleStripeEvent(checkout(), deps);

    expect(result).toEqual({ status: "processed" });
    expect(deps.inviteUser).toHaveBeenCalledTimes(1);
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("reativação com pagamento assíncrono (incomplete) mantém a exclusão já agendada", async () => {
    db.tables.subscriptions.push({
      user_id: "cliente-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_velha",
      status: "canceled",
      canceled_at: "2026-10-01T00:00:00Z",
      purge_after: "2026-10-31T00:00:00Z",
    });
    subs.sub_2 = sub("sub_2", "incomplete");

    const result = await handleStripeEvent(checkout({ subscription: "sub_2" }), deps);

    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      user_id: "cliente-1",
      stripe_subscription_id: "sub_2",
      status: "incomplete",
      canceled_at: "2026-10-01T00:00:00Z",
      purge_after: "2026-10-31T00:00:00Z",
    });
  });

  it("checkout de assinatura já cancelada na Stripe agenda a exclusão, e a reentrega não empurra o prazo", async () => {
    subs.sub_1 = sub("sub_1", "canceled");

    await handleStripeEvent(checkout(), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });

    deps.now = () => new Date(NOW.getTime() + 3 * DAY_MS);
    await handleStripeEvent(checkout(), deps);
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });
  });

  it("erro ao ler a linha do usuário pede reenvio e não grava nada", async () => {
    deps.admin = failingRead(db, "user_id");

    const result = await handleStripeEvent(checkout(), deps);

    expect(result).toMatchObject({ status: "retry", reason: expect.stringContaining("boom") });
    expect(db.tables.subscriptions).toHaveLength(0);
    // Recuperada só para conferir o preço; nada é gravado.
    expect(deps.retrieveSubscription).toHaveBeenCalledTimes(1);
  });

  it("erro ao procurar o cliente da Stripe pede reenvio sem cair no caminho do e-mail", async () => {
    deps.admin = failingRead(db, "stripe_customer_id");

    const result = await handleStripeEvent(checkout(), deps);

    expect(result).toMatchObject({ status: "retry", reason: expect.stringContaining("boom") });
    expect(deps.findUserIdByEmail).not.toHaveBeenCalled();
    expect(deps.inviteUser).not.toHaveBeenCalled();
    expect(db.tables.subscriptions).toHaveLength(0);
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

  it("created é tratado como updated: cliente desconhecido pede reenvio, conhecido usa o status do retrieve", async () => {
    const created = evt("customer.subscription.created", sub("sub_1", "incomplete"));

    expect((await handleStripeEvent(created, deps)).status).toBe("retry");
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();

    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "incomplete" });
    const result = await handleStripeEvent(created, deps);

    expect(result).toEqual({ status: "processed" });
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    // O snapshot do evento dizia incomplete; a Stripe (subs.sub_1) diz active.
    expect(db.tables.subscriptions[0].status).toBe("active");
  });

  it("updated muda status e período usando o estado atual da Stripe, não o snapshot do evento", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    subs.sub_1 = sub("sub_1", "past_due");
    // O evento carrega um snapshot velho: outro status e outro período.
    const stale = sub("sub_1", "active", "cus_1", PERIOD_END - 1000);

    await handleStripeEvent(evt("customer.subscription.updated", stale), deps);

    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "past_due",
      current_period_end: PERIOD_END_ISO,
      canceled_at: null,
      purge_after: null,
    });
  });

  it("created(incomplete) reentregue depois do checkout não rebaixa quem já pagou", async () => {
    // Ordem real: o checkout grava active (retrieve fresco) e depois a Stripe
    // reentrega o created congelado em incomplete.
    await handleStripeEvent(checkout(), deps);
    expect(db.tables.subscriptions[0].status).toBe("active");

    const result = await handleStripeEvent(evt("customer.subscription.created", sub("sub_1", "incomplete")), deps);

    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions).toHaveLength(1);
    expect(db.tables.subscriptions[0]).toMatchObject({ status: "active", canceled_at: null, purge_after: null });
  });

  it("updated de assinatura já cancelada na Stripe agenda a exclusão, e o deleted que chega depois não muda o prazo", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    subs.sub_1 = sub("sub_1", "canceled");

    await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "active")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });

    deps.now = () => new Date(NOW.getTime() + DAY_MS);
    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });
  });

  it.each(["incomplete_expired", "unpaid", "paused"] as const)(
    "updated para %s não mexe em canceled_at nem purge_after",
    async (status) => {
      db.tables.subscriptions.push({
        user_id: "c1",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        status: "incomplete",
        canceled_at: "2026-10-01T00:00:00Z",
        purge_after: "2026-10-31T00:00:00Z",
      });
      subs.sub_1 = sub("sub_1", status);

      await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "incomplete")), deps);

      expect(db.tables.subscriptions[0]).toMatchObject({
        status,
        canceled_at: "2026-10-01T00:00:00Z",
        purge_after: "2026-10-31T00:00:00Z",
      });
    }
  );

  it("unpaid não agenda exclusão: só canceled agenda", async () => {
    db.tables.subscriptions.push({
      user_id: "c1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      status: "past_due",
      canceled_at: null,
      purge_after: null,
    });
    subs.sub_1 = sub("sub_1", "unpaid");

    await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "past_due")), deps);

    expect(db.tables.subscriptions[0]).toMatchObject({ status: "unpaid", canceled_at: null, purge_after: null });
  });

  it("deleted marca cancelada e agenda exclusão para 30 dias", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    });
    // O payload do deleted já é final: não precisa perguntar de novo à Stripe.
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("deleted reentregue não empurra o prazo de exclusão", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    const deleted = evt("customer.subscription.deleted", sub("sub_1", "canceled"));

    await handleStripeEvent(deleted, deps);
    deps.now = () => new Date(NOW.getTime() + 5 * DAY_MS);
    const result = await handleStripeEvent(deleted, deps);

    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("deleted da assinatura nova de uma reativação pendente (incomplete) recomeça os 30 dias", async () => {
    // A linha não estava cancelada (estava incomplete, com o prazo velho de
    // antes da reativação): não é reentrega, então vale purge_after = canceled_at + 30.
    db.tables.subscriptions.push({
      user_id: "c1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_2",
      status: "incomplete",
      canceled_at: "2026-10-01T00:00:00Z",
      purge_after: "2026-10-31T00:00:00Z",
    });

    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_2", "canceled")), deps);

    expect(db.tables.subscriptions[0]).toMatchObject({
      status: "canceled",
      canceled_at: NOW.toISOString(),
      purge_after: PURGE_AT,
    });
  });

  it("updated(active) reentregue depois do deleted é ignorado: a linha continua cancelada com o mesmo purge_after", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
    await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    const canceled = { ...db.tables.subscriptions[0] };
    expect(canceled).toMatchObject({ status: "canceled", purge_after: PURGE_AT });

    deps.now = () => new Date(NOW.getTime() + 2 * DAY_MS);
    const result = await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "active")), deps);

    expect(result).toEqual({ status: "ignored" });
    expect(db.tables.subscriptions[0]).toEqual(canceled);
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("erro ao procurar o cliente num evento de assinatura pede reenvio com o motivo real", async () => {
    deps.admin = failingRead(db, "stripe_customer_id");

    const result = await handleStripeEvent(evt("customer.subscription.updated", sub("sub_1", "active")), deps);

    expect(result).toMatchObject({ status: "retry", reason: expect.stringContaining("boom") });
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("evento de assinatura antiga não derruba a nova", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_2", status: "active" });
    const result = await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(result).toEqual({ status: "ignored" });
    expect(db.tables.subscriptions[0].status).toBe("active");
  });

  it("checkout logado: o user_id do metadata vale mais que o e-mail digitado", async () => {
    const uid = "11111111-2222-4333-8444-555555555555";
    deps.findUserIdByEmail = vi.fn(async () => "outra-conta");
    await handleStripeEvent(checkout({ metadata: { falow_user_id: uid } }), deps);
    expect(deps.findUserIdByEmail).not.toHaveBeenCalled();
    expect(deps.inviteUser).not.toHaveBeenCalled();
    expect(db.tables.subscriptions[0]).toMatchObject({ user_id: uid, stripe_customer_id: "cus_1" });
  });

  it("checkout sem login com e-mail de conta que tem assinatura viva em outro cliente: não religa", async () => {
    deps.findUserIdByEmail = vi.fn(async () => "vitima");
    const row = { user_id: "vitima", stripe_customer_id: "cus_vitima", stripe_subscription_id: "sub_vitima", status: "unpaid", purge_after: null };
    db.tables.subscriptions.push({ ...row });
    const result = await handleStripeEvent(checkout(), deps);
    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions).toEqual([expect.objectContaining(row)]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("checkout sem login com e-mail de conta cancelada: religa (reativação pela landing)", async () => {
    deps.findUserIdByEmail = vi.fn(async () => "cliente-1");
    db.tables.subscriptions.push({ user_id: "cliente-1", stripe_customer_id: "cus_velho", stripe_subscription_id: "sub_velha", status: "canceled", purge_after: "2026-11-01T00:00:00Z" });
    await handleStripeEvent(checkout(), deps);
    expect(db.tables.subscriptions[0]).toMatchObject({ user_id: "cliente-1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active", purge_after: null });
  });

  it("deleted de cliente desconhecido é ignorado (sem 500 por dias)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await handleStripeEvent(evt("customer.subscription.deleted", sub("sub_1", "canceled")), deps);
    expect(result).toEqual({ status: "ignored" });
  });

  it("evento antigo de cliente desconhecido é ignorado com log, recente pede reenvio", async () => {
    const old = { ...evt("customer.subscription.updated", sub("sub_1", "active")), created: Math.floor(NOW.getTime() / 1000) - 7 * 3600 } as Stripe.Event;
    expect(await handleStripeEvent(old, deps)).toEqual({ status: "ignored" });
    const fresh = { ...old, created: Math.floor(NOW.getTime() / 1000) - 60 } as Stripe.Event;
    expect((await handleStripeEvent(fresh, deps)).status).toBe("retry");
  });

  it("assinatura nova criada no dashboard para cliente cancelado entra (id diferente, dá acesso)", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_velha", status: "canceled", canceled_at: "2026-10-01T00:00:00Z", purge_after: "2026-10-31T00:00:00Z" });
    subs.sub_nova = sub("sub_nova", "active");
    const result = await handleStripeEvent(evt("customer.subscription.created", sub("sub_nova", "active")), deps);
    expect(result).toEqual({ status: "processed" });
    expect(db.tables.subscriptions[0]).toMatchObject({ stripe_subscription_id: "sub_nova", status: "active", purge_after: null });
  });

  it("assinatura de id diferente sem acesso não substitui a linha", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_velha", status: "canceled", purge_after: "2026-10-31T00:00:00Z" });
    subs.sub_nova = sub("sub_nova", "incomplete");
    const result = await handleStripeEvent(evt("customer.subscription.created", sub("sub_nova", "incomplete")), deps);
    expect(result).toEqual({ status: "ignored" });
    expect(db.tables.subscriptions[0].stripe_subscription_id).toBe("sub_velha");
  });

  it("tipo de evento desconhecido é ignorado", async () => {
    expect(await handleStripeEvent(evt("invoice.paid", {}), deps)).toEqual({ status: "ignored" });
  });

  describe("filtro pelo preço do Falow (STRIPE_PRICE_ID)", () => {
    let warnSpy: MockInstance<typeof console.warn>;

    beforeEach(() => {
      vi.stubEnv("STRIPE_PRICE_ID", "price_falow");
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("checkout de assinatura de outro preço é ignorado: sem consulta de e-mail, sem convite, sem linha", async () => {
      subs.sub_1 = sub("sub_1", "active", "cus_1", PERIOD_END, "price_outro");

      const result = await handleStripeEvent(checkout(), deps);

      expect(result).toEqual({ status: "ignored" });
      expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
      expect(deps.findUserIdByEmail).not.toHaveBeenCalled();
      expect(deps.inviteUser).not.toHaveBeenCalled();
      expect(db.tables.subscriptions).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain("sub_1");
    });

    it("checkout de outro preço não mexe na linha de um cliente do Falow com o mesmo cliente Stripe", async () => {
      db.tables.subscriptions.push({
        user_id: "cliente-1",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_velha",
        status: "canceled",
        canceled_at: "2026-10-01T00:00:00Z",
        purge_after: "2026-10-31T00:00:00Z",
      });
      const before = { ...db.tables.subscriptions[0] };
      subs.sub_2 = sub("sub_2", "active", "cus_1", PERIOD_END, "price_outro");

      const result = await handleStripeEvent(checkout({ subscription: "sub_2" }), deps);

      expect(result).toEqual({ status: "ignored" });
      expect(db.tables.subscriptions).toEqual([before]);
    });

    it("checkout com o preço certo segue o fluxo normal", async () => {
      subs.sub_1 = sub("sub_1", "active", "cus_1", PERIOD_END, "price_falow");

      const result = await handleStripeEvent(checkout(), deps);

      expect(result).toEqual({ status: "processed" });
      expect(deps.inviteUser).toHaveBeenCalledWith("Cliente@Exemplo.com");
      expect(db.tables.subscriptions).toEqual([
        expect.objectContaining({ user_id: "novo-user", stripe_subscription_id: "sub_1", status: "active" }),
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("preço como string no item também vale; espaço em volta da env é ignorado", async () => {
      vi.stubEnv("STRIPE_PRICE_ID", " price_falow\n");
      subs.sub_1 = {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        items: { data: [{ current_period_end: PERIOD_END, price: "price_falow" }] },
      } as unknown as Stripe.Subscription;

      expect(await handleStripeEvent(checkout(), deps)).toEqual({ status: "processed" });
      expect(db.tables.subscriptions).toHaveLength(1);
    });

    it("assinatura com vários itens vale se algum item for do preço do Falow", async () => {
      subs.sub_1 = {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        items: {
          data: [
            { current_period_end: PERIOD_END, price: { id: "price_outro" } },
            { current_period_end: PERIOD_END, price: { id: "price_falow" } },
          ],
        },
      } as unknown as Stripe.Subscription;

      expect(await handleStripeEvent(checkout(), deps)).toEqual({ status: "processed" });
    });

    it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"])(
      "%s de outro preço é ignorado sem tocar no banco nem na Stripe",
      async (type) => {
        db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
        const before = { ...db.tables.subscriptions[0] };
        const from = vi.fn();
        deps.admin = { from };

        const result = await handleStripeEvent(evt(type, sub("sub_1", "canceled", "cus_1", PERIOD_END, "price_outro")), deps);

        expect(result).toEqual({ status: "ignored" });
        expect(from).not.toHaveBeenCalled();
        expect(deps.retrieveSubscription).not.toHaveBeenCalled();
        expect(db.tables.subscriptions).toEqual([before]);
      }
    );

    it("updated com o preço certo segue o comportamento atual", async () => {
      db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });
      subs.sub_1 = sub("sub_1", "past_due", "cus_1", PERIOD_END, "price_falow");

      const result = await handleStripeEvent(
        evt("customer.subscription.updated", sub("sub_1", "active", "cus_1", PERIOD_END, "price_falow")),
        deps
      );

      expect(result).toEqual({ status: "processed" });
      expect(db.tables.subscriptions[0]).toMatchObject({ status: "past_due", current_period_end: PERIOD_END_ISO });
    });

    it("deleted com o preço certo agenda a exclusão", async () => {
      db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", status: "active" });

      const result = await handleStripeEvent(
        evt("customer.subscription.deleted", sub("sub_1", "canceled", "cus_1", PERIOD_END, "price_falow")),
        deps
      );

      expect(result).toEqual({ status: "processed" });
      expect(db.tables.subscriptions[0]).toMatchObject({ status: "canceled", canceled_at: NOW.toISOString(), purge_after: PURGE_AT });
    });

    it("sem STRIPE_PRICE_ID não há filtro (item sem preço passa)", async () => {
      vi.stubEnv("STRIPE_PRICE_ID", "");
      // sub_1 do beforeEach de fora não tem preço no item.
      expect(await handleStripeEvent(checkout(), deps)).toEqual({ status: "processed" });
      expect(db.tables.subscriptions).toHaveLength(1);
    });
  });
});
