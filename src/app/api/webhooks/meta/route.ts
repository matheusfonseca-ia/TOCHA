import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";

import {
  processWebhookPayload,
  type MetaWebhookPayload,
} from "@/lib/meta/process";
import { secretEquals } from "@/lib/crypto";
import { verifyMetaSignature } from "@/lib/meta/verify";

export const dynamic = "force-dynamic";

// Payloads reais da Meta têm poucos KB: acima disso nem lemos o corpo.
const MAX_BODY_BYTES = 1024 * 1024;

/** Verificação do webhook (feita uma vez, ao configurar no painel Meta). */
export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  // Segredo ausente ou vazio: nada é aceito (vazio deixaria qualquer um verificar).
  if (!verifyToken) {
    return new NextResponse("META_VERIFY_TOKEN não configurado", { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    secretEquals(params.get("hub.verify_token"), verifyToken)
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Lê o corpo com teto de tamanho (o content-length pode faltar ou mentir).
 * Devolve null se passar do teto.
 */
async function readBodyCapped(request: NextRequest): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * `waitUntil` do Worker (OpenNext): mantém a invocação viva por até ~30s
 * depois da resposta. Fora do Worker (testes, `next dev` sem o contexto)
 * não existe e o processamento roda antes de responder, como antes.
 */
function backgroundRunner(): ((work: Promise<unknown>) => void) | null {
  try {
    const { ctx } = getCloudflareContext<Record<string, unknown>, { waitUntil(p: Promise<unknown>): void }>();
    return ctx && typeof ctx.waitUntil === "function" ? (work) => ctx.waitUntil(work) : null;
  } catch {
    return null;
  }
}

/**
 * Recebe eventos de mensagens do Instagram. Responde 200 assim que a
 * assinatura e o JSON são validados; o processamento (pausas humanizadas,
 * Graph API, workflows) segue em segundo plano via `waitUntil`, dentro do
 * orçamento de tempo do runtime (`invocationDeadline`). Para volumes maiores,
 * a evolução natural é uma Cloudflare Queue (exige configurar no painel).
 */
export async function POST(request: NextRequest) {
  // Sem assinatura nem vale ler o corpo.
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const rawBody = await readBodyCapped(request);
  if (!rawBody) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  if (!verifyMetaSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  // 200 mesmo em erro: evita tempestade de retries do Meta. A falha fica
  // registrada nos logs de interação/console.
  const work = processWebhookPayload(payload).catch((err) => {
    console.error("[webhook] erro ao processar payload:", err);
  });

  const runInBackground = backgroundRunner();
  if (runInBackground) {
    runInBackground(work);
  } else {
    await work;
  }

  return NextResponse.json({ received: true });
}
