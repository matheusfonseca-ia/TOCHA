import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Cliente da Stripe. No Worker da Cloudflare não existe o módulo http do
 * Node: o fetch client é obrigatório.
 */
export function getStripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY não configurada.");
    cached = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  }
  return cached;
}
