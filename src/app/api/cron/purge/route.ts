import { NextResponse, type NextRequest } from "next/server";

import { purgeExpiredUsers } from "@/lib/billing/purge";
import { secretEquals } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "crm-uploads";

/** Chamado 1x/dia pelo `scheduled()` do Worker (worker.ts). Autenticação só por header (sem segredo na URL). */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Sem segredo configurado responde igual a segredo errado (não revela a configuração).
  if (!secret) {
    console.error("[cron] CRON_SECRET não configurado: /api/cron/purge recusado");
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!secretEquals(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const admin = createAdminClient();
  const result = await purgeExpiredUsers({
    admin,
    async removeUploads(accountId) {
      // Os anexos ficam soltos em `<account_id>/<arquivo>` (ver composer.actions.ts).
      // Lista até 1000 por vez, apaga e repete até esvaziar. Toda saída que não
      // esvazia a pasta lança erro: isso impede o laço infinito e impede apagar
      // o usuário deixando arquivo dele para trás (o purge tenta de novo amanhã).
      for (;;) {
        const { data, error } = await admin.storage.from(BUCKET).list(accountId, { limit: 1000 });
        if (error) throw new Error(error.message);
        if (!data?.length) return;
        // Subpasta aparece na listagem com id nulo e não é apagável por `remove`.
        const files = data.filter((f) => f.id);
        if (!files.length) {
          throw new Error(`pasta ${accountId} tem subpastas que o purge não sabe esvaziar`);
        }
        const { data: removed, error: removeError } = await admin.storage
          .from(BUCKET)
          .remove(files.map((f) => `${accountId}/${f.name}`));
        if (removeError) throw new Error(removeError.message);
        // `remove` não falha quando não apaga nada; sem progresso o laço nunca acabaria.
        if (!removed?.length) throw new Error(`remove não apagou nada em ${accountId}`);
      }
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    },
  });

  // Limpa os registros de dedupe antigos (processed_events, stripe_events).
  // Falha aqui não invalida o purge: só registra e segue.
  let pruned: unknown = null;
  try {
    const { data, error } = await admin.rpc("falow_prune_old_events", { p_days: 14 });
    if (error) console.error("[cron] falha ao limpar eventos antigos:", error.message);
    else pruned = data;
  } catch (err) {
    console.error("[cron] falha ao limpar eventos antigos:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ...result, pruned });
}
