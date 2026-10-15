import { NextResponse } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Minha assinatura": cartão, notas e cancelamento ficam no portal da Stripe. */
export async function POST() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl), 303);

  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle<{ stripe_customer_id: string }>();
  if (!data) return NextResponse.redirect(new URL("/assinatura", appUrl), 303);

  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  });
  return NextResponse.redirect(session.url, 303);
}
