import { NextResponse } from "next/server";

import { isOwner } from "@/lib/billing/access";
import { checkoutDecision } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Botão "Assinar" (landing) e "Reativar" (/assinatura). */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subscription } = user
    ? await supabase
        .from("subscriptions")
        .select("status, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle<{ status: string; stripe_customer_id: string }>()
    : { data: null };

  const decision = checkoutDecision({ userId: user?.id ?? null, owner: isOwner(user?.id), subscription });
  if (decision.kind === "dashboard") return NextResponse.redirect(new URL("/dashboard", appUrl), 303);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${appUrl}/assinatura/obrigado`,
    cancel_url: user ? `${appUrl}/assinatura` : `${appUrl}/`,
    locale: "pt-BR",
    allow_promotion_codes: true,
    ...(decision.customer
      ? { customer: decision.customer }
      : user?.email
        ? { customer_email: user.email }
        : {}),
  });

  return NextResponse.redirect(session.url!, 303);
}
