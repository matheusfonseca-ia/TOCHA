import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { listFolders } from "@/app/(dashboard)/rules/folders-actions";
import { createClient } from "@/lib/supabase/server";
import {
  SequencesManager,
  type SequenceStats,
  type SequenceWithAccount,
} from "@/modules/automations";

export default async function SequenciasPage() {
  const supabase = createClient();

  const [accountsRes, sequencesRes] = await Promise.all([
    supabase
      .from("ig_accounts")
      .select("id")
      .eq("status", "active")
      .limit(1),
    supabase
      .from("sequences")
      .select("*, ig_accounts(ig_username)")
      .order("created_at"),
  ]);

  if ((accountsRes.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Conecte uma conta primeiro"
        description="Os workflows precisam de uma conta do Instagram conectada."
      >
        <Button asChild>
          <Link href="/accounts">Conectar Instagram</Link>
        </Button>
      </EmptyState>
    );
  }

  const sequences = (sequencesRes.data ?? []) as SequenceWithAccount[];
  const folders = await listFolders();

  // Total e "no fluxo agora" contados no banco por workflow (índice único
  // começa por sequence_id), sem baixar os runs: o teto de 1000 linhas do
  // PostgREST cortava os números em silêncio.
  const stats: Record<string, SequenceStats> = {};
  const runCount = (sequenceId: string, statuses?: string[]) => {
    let query = supabase
      .from("sequence_runs")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", sequenceId);
    if (statuses) query = query.in("status", statuses);
    return query.then(({ count }) => count ?? 0);
  };
  await Promise.all(
    sequences.map(async (sequence) => {
      const [total, inFlow] = await Promise.all([
        runCount(sequence.id),
        runCount(sequence.id, ["running", "waiting_reply", "waiting_postback", "waiting_delay"]),
      ]);
      if (total > 0) stats[sequence.id] = { total, inFlow };
    })
  );

  return (
    <SequencesManager
      sequences={sequences}
      stats={stats}
      folders={folders}
      accountId={accountsRes.data?.[0]?.id}
    />
  );
}
