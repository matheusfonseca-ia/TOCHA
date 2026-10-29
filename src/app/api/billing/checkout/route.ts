import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { accessGrantOf, isAdmin } from "@/lib/billing/access";
import { checkoutDecision, hasOpenSubscription, isSameOriginRequest } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { CHECKOUT_USER_METADATA } from "@/lib/billing/stripe-events";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Botão "Assinar" (landing) e "Reativar" (/assinatura).
 *
 * Aceita visitante anônimo (botão da landing), mas só de POST da mesma origem.
 * O limite de taxa contra criação em massa de sessões fica na borda (regra de
 * Rate Limiting da Cloudflare em /sistema/api/billing/*).
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers, appUrl("/"))) {
    return new NextResponse("Origem não permitida", { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subscription, error } = user
    ? await supabase
        .from("subscriptions")
        .select("status, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle<{ status: string; stripe_customer_id: string }>()
    : { data: null, error: null };

  // Erro de leitura não é "sem assinatura": abrir um Checkout aqui criaria uma 2ª assinatura paga
  // (por customer_email, em outro cliente da Stripe) para quem já paga.
  if (error) {
    console.error("[billing] falha ao ler a assinatura:", error.message);
    return NextResponse.redirect(appUrl("/assinatura"), 303);
  }

  // Bloqueado não vai para a Stripe. Erro ao ler o bloqueio = dúvida = não cobra.
  let blocked = false;
  if (user && !isAdmin(user.id)) {
    const { grant, error: grantError } = await accessGrantOf(supabase, user.id);
    if (grantError) return NextResponse.redirect(appUrl("/assinatura"), 303);
    blocked = grant?.kind === "block";
  }

  const decision = checkoutDecision({ userId: user?.id ?? null, owner: isAdmin(user?.id), blocked, subscription });
  if (decision.kind === "dashboard") return NextResponse.redirect(appUrl("/dashboard"), 303);
  if (decision.kind === "blocked") return NextResponse.redirect(appUrl("/assinatura"), 303);

  const stripe = getStripe();

  // Reativação: se o cliente ainda tem uma assinatura que pode cobrar
  // (incomplete com 3DS pendente, unpaid, past_due...), outro Checkout abriria
  // a segunda assinatura no mesmo cliente. Manda para o portal pagar a pendente.
  if (decision.customer) {
    let statuses: string[];
    try {
      const list = await stripe.subscriptions.list({ customer: decision.customer, status: "all", limit: 20 });
      statuses = list.data.map((s) => s.status);
    } catch (err) {
      console.error("[billing] falha ao listar as assinaturas do cliente:", err instanceof Error ? err.message : err);
      return NextResponse.redirect(appUrl("/assinatura"), 303);
    }
    if (hasOpenSubscription(statuses)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: decision.customer,
        return_url: appUrl("/assinatura"),
      });
      return NextResponse.redirect(portal.url, 303);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: appUrl("/assinatura/obrigado"),
    cancel_url: user ? appUrl("/assinatura") : appUrl("/"),
    locale: "pt-BR",
    allow_promotion_codes: true,
    ...(decision.customer
      ? { customer: decision.customer }
      : user?.email
        ? { customer_email: user.email }
        : {}),
    // Compra logada: o webhook liga a assinatura a este usuário, não ao e-mail
    // digitado no Checkout (que a Stripe não verifica).
    ...(user
      ? {
          client_reference_id: user.id,
          metadata: { [CHECKOUT_USER_METADATA]: user.id },
          subscription_data: { metadata: { [CHECKOUT_USER_METADATA]: user.id } },
        }
      : {}),
  });

  return NextResponse.redirect(session.url!, 303);
}
