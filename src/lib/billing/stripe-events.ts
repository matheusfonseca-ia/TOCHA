import type Stripe from "stripe";

import { isAccessStatus, type QueryClient } from "@/lib/billing/access";

/**
 * Tradução dos eventos da Stripe para a tabela `subscriptions`. Puro: Stripe
 * e Supabase Auth entram por `deps`, então o teste roda sem rede.
 *
 * A Stripe não garante ordem de entrega: evento de assinatura de cliente
 * ainda desconhecido devolve "retry" (a rota responde 500 e a Stripe reenvia).
 */

export const PURGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export interface StripeEventDeps {
  admin: QueryClient;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  findUserIdByEmail(email: string): Promise<string | null>;
  inviteUser(email: string): Promise<string>;
  now?: () => Date;
}

export type StripeEventResult =
  | { status: "processed" | "ignored" }
  | { status: "retry"; reason: string };

type Ref = string | { id: string } | null | undefined;

function idOf(ref: Ref): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** Na API 2025-03+ o período mora nos itens; versões antigas tinham no topo. */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { items?: { data?: { current_period_end?: number }[] } }).items?.data?.[0]
      ?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckout(event.data.object as Stripe.Checkout.Session, deps);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscription(
        event.data.object as Stripe.Subscription,
        event.type === "customer.subscription.deleted",
        deps
      );
    default:
      return { status: "ignored" };
  }
}

async function handleCheckout(
  session: Stripe.Checkout.Session,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  if (session.mode !== "subscription") return { status: "ignored" };

  const customerId = idOf(session.customer as Ref);
  const subscriptionId = idOf(session.subscription as Ref);
  if (!customerId || !subscriptionId) {
    return { status: "retry", reason: "sessão sem cliente ou assinatura" };
  }

  // Reativação: o cliente da Stripe já tem linha. Compra nova: pelo e-mail.
  const { data: byCustomer } = await deps.admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  let userId = (byCustomer as { user_id?: string } | null)?.user_id ?? null;

  if (!userId) {
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    if (!email) return { status: "retry", reason: "sessão sem e-mail" };
    userId = (await deps.findUserIdByEmail(email)) ?? (await deps.inviteUser(email));
  }

  const { data: previous } = await deps.admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  const prev = previous as { stripe_subscription_id?: string | null; status?: string } | null;
  if (prev?.stripe_subscription_id && prev.stripe_subscription_id !== subscriptionId && isAccessStatus(prev.status)) {
    console.error(
      `[stripe] usuário ${userId} comprou de novo com assinatura ativa: ${prev.stripe_subscription_id} substituída por ${subscriptionId}. Cancelar/reembolsar a antiga na Stripe.`
    );
  }

  const sub = await deps.retrieveSubscription(subscriptionId);
  const now = (deps.now ?? (() => new Date()))();
  const { error } = await deps.admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEndOf(sub),
      canceled_at: null,
      purge_after: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { status: "retry", reason: `upsert falhou: ${error.message}` };
  return { status: "processed" };
}

async function handleSubscription(
  sub: Stripe.Subscription,
  deleted: boolean,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  const customerId = idOf(sub.customer as Ref);
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const row = data as { user_id: string; stripe_subscription_id: string | null } | null;
  if (!row) return { status: "retry", reason: "cliente ainda desconhecido" };
  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) return { status: "ignored" };

  const now = (deps.now ?? (() => new Date()))();
  const status = deleted ? "canceled" : sub.status;
  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEndOf(sub),
    updated_at: now.toISOString(),
  };
  if (status === "canceled") {
    patch.canceled_at = now.toISOString();
    patch.purge_after = new Date(now.getTime() + PURGE_AFTER_DAYS * DAY_MS).toISOString();
  } else if (isAccessStatus(status)) {
    patch.canceled_at = null;
    patch.purge_after = null;
  }

  const { error } = await deps.admin.from("subscriptions").update(patch).eq("user_id", row.user_id);
  if (error) return { status: "retry", reason: `update falhou: ${error.message}` };
  return { status: "processed" };
}
