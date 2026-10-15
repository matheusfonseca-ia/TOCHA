import { isAccessStatus } from "@/lib/billing/access";

export type CheckoutDecision = { kind: "dashboard" } | { kind: "checkout"; customer?: string };

/** Quem já tem acesso não abre uma segunda assinatura; reativação reaproveita o cliente da Stripe. */
export function checkoutDecision(input: {
  userId: string | null;
  owner: boolean;
  subscription: { status: string; stripe_customer_id: string } | null;
}): CheckoutDecision {
  if (input.owner) return { kind: "dashboard" };
  if (input.subscription && isAccessStatus(input.subscription.status)) return { kind: "dashboard" };
  if (input.subscription) return { kind: "checkout", customer: input.subscription.stripe_customer_id };
  return { kind: "checkout" };
}
