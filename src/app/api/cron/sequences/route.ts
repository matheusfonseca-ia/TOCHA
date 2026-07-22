import { NextResponse, type NextRequest } from "next/server";

import { processDueRuns } from "@/lib/sequences/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tick das sequências: retoma execuções paradas em nós de atraso cujo
 * horário venceu. Chamado pelo cron da Vercel (vercel.json) e por qualquer
 * agendador externo (cron-job.org, UptimeRobot...) — além do tick
 * oportunista que roda ao fim de cada webhook.
 *
 * Autenticação: header `Authorization: Bearer <CRON_SECRET>` (o cron da
 * Vercel envia isso sozinho quando a env CRON_SECRET existe) ou
 * `?secret=<CRON_SECRET>` para agendadores que não suportam headers.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization");
  const bySecret = request.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && bySecret !== secret) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const processed = await processDueRuns(10);
  return NextResponse.json({ processed });
}
