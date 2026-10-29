import { isAccessStatus } from "@/lib/billing/access";

export type CheckoutDecision =
  | { kind: "dashboard" }
  | { kind: "blocked" }
  | { kind: "checkout"; customer?: string };

/**
 * Quem já tem acesso não abre uma segunda assinatura; reativação reaproveita o
 * cliente da Stripe. Bloqueado (access_grants kind=block) não paga: o bloqueio
 * vence a assinatura, então ele pagaria por um serviço que não recebe.
 */
export function checkoutDecision(input: {
  userId: string | null;
  owner: boolean;
  blocked?: boolean;
  subscription: { status: string; stripe_customer_id: string } | null;
}): CheckoutDecision {
  if (input.owner) return { kind: "dashboard" };
  if (input.blocked) return { kind: "blocked" };
  if (input.subscription && isAccessStatus(input.subscription.status)) return { kind: "dashboard" };
  if (input.subscription) return { kind: "checkout", customer: input.subscription.stripe_customer_id };
  return { kind: "checkout" };
}

/**
 * Status da Stripe em que a assinatura ainda pode cobrar ou voltar a valer
 * (3DS pendente, fatura em aberto, pausa). Com uma destas no cliente, um novo
 * Checkout criaria a segunda assinatura: o caminho é o portal (pagar a fatura).
 */
const OPEN_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "incomplete", "unpaid", "paused"];

export function hasOpenSubscription(statuses: readonly string[]): boolean {
  return statuses.some((s) => OPEN_SUBSCRIPTION_STATUSES.includes(s));
}

/**
 * POST de formulário vindo do próprio app (ou da landing, mesma origem). As
 * rotas de cobrança são Route Handlers, sem a checagem de Origin que o Next
 * faz nas Server Actions. Ordem: Origin → Sec-Fetch-Site → Referer; sem
 * nenhum dos três, recusa (navegadores atuais sempre mandam Origin em POST).
 */
export function isSameOriginRequest(headers: Headers, appBaseUrl: string): boolean {
  let appOrigin: string;
  try {
    appOrigin = new URL(appBaseUrl).origin;
  } catch {
    return false;
  }
  const origin = headers.get("origin");
  if (origin) return origin === appOrigin;
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const referer = headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === appOrigin;
  } catch {
    return false;
  }
}
