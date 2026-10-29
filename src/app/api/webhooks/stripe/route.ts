import Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { stripeEventDeps } from "@/lib/billing/stripe-deps";
import { handleStripeEvent } from "@/lib/billing/stripe-events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Eventos da Stripe têm poucos KB; acima disto nem chega a ler o corpo. */
const MAX_STRIPE_BODY_BYTES = 1024 * 1024;

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Lê o corpo com teto: recusa pelo Content-Length antes de ler e, sem ele
 * (chunked), para de ler ao passar do limite. Nulo = grande demais.
 */
async function readLimitedBody(request: NextRequest, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * Webhook da Stripe. Corpo cru + verificação assíncrona (Web Crypto): o
 * `constructEvent` síncrono não roda no Worker.
 *
 * Idempotência: o id do evento é reservado em `stripe_events` ANTES de
 * processar (a PK faz o papel de trava). Duas entregas simultâneas do mesmo
 * evento: só uma consegue o insert; a outra recebe 23505 e responde 200
 * "duplicate". Se o processamento falha (ou pede "retry"), a reserva é
 * apagada e a rota devolve 500 para a Stripe reenviar. Erro de banco na
 * reserva também devolve 500 (nunca vira "não visto" em silêncio).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET não configurado" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Assinatura ausente", { status: 400 });

  const body = await readLimitedBody(request, MAX_STRIPE_BODY_BYTES);
  if (body === null) return new NextResponse("Corpo grande demais", { status: 413 });

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
  const { error: claimError } = await admin.from("stripe_events").insert({ id: event.id });
  if (claimError) {
    if (claimError.code === PG_UNIQUE_VIOLATION) return NextResponse.json({ duplicate: true });
    console.error(`[stripe] ${event.type} ${event.id}: falha ao reservar o evento:`, claimError.message);
    return NextResponse.json({ error: "falha ao registrar o evento" }, { status: 500 });
  }

  // Libera a reserva para a reentrega da Stripe processar de novo.
  async function release() {
    const { error } = await admin.from("stripe_events").delete().eq("id", event.id);
    if (error) {
      console.error(
        `[stripe] ${event.type} ${event.id}: falhou E a reserva não foi apagada (${error.message}). As reentregas serão tratadas como duplicadas: reprocessar à mão (apagar a linha em stripe_events e reenviar pelo dashboard).`
      );
    }
  }

  try {
    const result = await handleStripeEvent(event, stripeEventDeps(admin));
    if (result.status === "retry") {
      console.warn(`[stripe] ${event.type} ${event.id} adiado: ${result.reason}`);
      await release();
      return NextResponse.json({ retry: result.reason }, { status: 500 });
    }
  } catch (err) {
    console.error(`[stripe] ${event.type} ${event.id} falhou:`, err instanceof Error ? err.message : err);
    await release();
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
