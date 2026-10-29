import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { isSameOriginRequest } from "@/lib/billing/checkout";
import { getStripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Minha assinatura": cartão, notas e cancelamento ficam no portal da Stripe. */
export async function POST(request: Request) {
  // Route Handler não tem a checagem de Origin das Server Actions: sem isto, uma
  // página do mesmo site levaria o cliente logado ao portal sem ele pedir.
  if (!isSameOriginRequest(request.headers, appUrl("/"))) {
    return new NextResponse("Origem não permitida", { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(appUrl("/login"), 303);

  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle<{ stripe_customer_id: string }>();
  if (error) {
    console.error("[billing] falha ao ler a assinatura:", error.message);
    return NextResponse.redirect(appUrl("/assinatura"), 303);
  }
  if (!data) return NextResponse.redirect(appUrl("/assinatura"), 303);

  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: appUrl("/dashboard"),
  });
  return NextResponse.redirect(session.url, 303);
}
