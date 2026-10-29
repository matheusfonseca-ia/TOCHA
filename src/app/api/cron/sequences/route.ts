import { NextResponse, type NextRequest } from "next/server";

import { secretEquals } from "@/lib/crypto";
import { expireAutomationsSafe } from "@/lib/expiry/sweep";
import { processDueRuns } from "@/lib/sequences/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tick das sequências: expira automações/workflows temporários vencidos e
 * retoma execuções paradas em nós de atraso cujo horário venceu. Chamado a
 * cada minuto pelo `scheduled()` do Worker (worker.ts), além do tick
 * oportunista que roda ao fim de cada webhook.
 *
 * Autenticação só pelo header `Authorization: Bearer <CRON_SECRET>` (é o que
 * o `scheduled()` envia). Segredo na query string (`?secret=`) não vale mais:
 * URL vai para os logs do Worker e de qualquer agendador externo.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET não configurado: /api/cron/sequences recusado");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!secretEquals(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Antes dos atrasos: workflow que acabou de expirar não retoma execuções.
  const expired = await expireAutomationsSafe();
  const processed = await processDueRuns(10);
  return NextResponse.json({ processed, expired });
}
