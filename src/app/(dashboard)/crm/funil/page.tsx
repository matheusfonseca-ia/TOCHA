import Link from "next/link";
import { notFound } from "next/navigation";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PipelineBoard } from "@/modules/crm";
import { ensureDefaultPipeline, getBoard, listPipelines } from "@/modules/crm/server";

export const dynamic = "force-dynamic";

/**
 * Funil (Fase 5). Tela cheia, igual ao Inbox e ao editor de Workflow. O
 * funil padrão é garantido aqui (idempotente) antes de montar o board:
 * cobre tanto quem nunca visitou a tela quanto uma conta nova.
 */
export default async function FunilPage({
  searchParams,
}: {
  searchParams: { funil?: string; conta?: string };
}) {
  const supabase = createClient();

  const { data: accountsData } = await supabase.from("ig_accounts").select("id, ig_username").order("connected_at");
  const accounts = accountsData ?? [];

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Nenhuma conta conectada"
        description="Conecte a conta do Instagram para o funil aparecer aqui."
      >
        <Button asChild>
          <Link href="/accounts">Conectar conta</Link>
        </Button>
      </EmptyState>
    );
  }

  const accountId = accounts.some((a) => a.id === searchParams.conta) ? (searchParams.conta as string) : accounts[0].id;

  // Idempotente: só cria na 1ª visita da conta.
  await ensureDefaultPipeline(createAdminClient(), accountId);

  const pipelines = await listPipelines(supabase, accountId);
  const pipelineId = pipelines.some((p) => p.id === searchParams.funil) ? (searchParams.funil as string) : pipelines[0]?.id;
  if (!pipelineId) notFound();

  const [board, { data: sequenceRows }] = await Promise.all([
    getBoard(supabase, pipelineId),
    supabase.from("sequences").select("id, name").eq("account_id", accountId).eq("is_active", true).order("name"),
  ]);
  if (!board) notFound();

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex bg-background md:left-60 md:top-0">
      <PipelineBoard board={board} accounts={accounts} pipelines={pipelines} sequences={sequenceRows ?? []} />
    </div>
  );
}
