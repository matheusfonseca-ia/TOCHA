import { NextResponse, type NextRequest } from "next/server";

import {
  processWebhookPayload,
  type MetaWebhookPayload,
} from "@/lib/meta/process";
import { verifyMetaSignature } from "@/lib/meta/verify";

export const dynamic = "force-dynamic";
// Delay de até 5s por regra + chamadas à Graph API: folga para lotes de mensagens
export const maxDuration = 60;

/** Verificação do webhook (feita uma vez, ao configurar no painel Meta). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === process.env.META_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/** Recebe eventos de mensagens do Instagram. */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (
    !verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))
  ) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  try {
    await processWebhookPayload(payload);
  } catch (err) {
    // 200 mesmo em erro: evita tempestade de retries do Meta.
    // A falha fica registrada nos logs de interação/console.
    console.error("[webhook] erro ao processar payload:", err);
  }

  return NextResponse.json({ received: true });
}
