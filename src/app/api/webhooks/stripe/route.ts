import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { stripeEventDeps } from "@/lib/billing/stripe-deps";
import { handleStripeEvent } from "@/lib/billing/stripe-events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Webhook da Stripe. Corpo cru + verificação assíncrona (Web Crypto): o
 * `constructEvent` síncrono não roda no Worker. Evento só é marcado em
 * `stripe_events` depois de processado; erro ou "retry" devolve 500 para a
 * Stripe reenviar.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET não configurado" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Assinatura ausente", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch {
    return new NextResponse("Assinatura inválida", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ duplicate: true });

  try {
    const result = await handleStripeEvent(event, stripeEventDeps(admin));
    if (result.status === "retry") {
      console.warn(`[stripe] ${event.type} ${event.id} adiado: ${result.reason}`);
      return NextResponse.json({ retry: result.reason }, { status: 500 });
    }
  } catch (err) {
    console.error(`[stripe] ${event.type} ${event.id} falhou:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }

  await admin.from("stripe_events").insert({ id: event.id });
  return NextResponse.json({ received: true });
}
