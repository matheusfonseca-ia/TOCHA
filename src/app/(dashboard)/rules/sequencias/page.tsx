import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import {
  SequencesManager,
  type SequenceStats,
  type SequenceWithAccount,
} from "@/components/sequences/sequences-manager";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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
        description="As sequências precisam de uma conta do Instagram conectada."
      >
        <Button asChild>
          <Link href="/accounts">Conectar Instagram</Link>
        </Button>
      </EmptyState>
    );
  }

  const sequences = (sequencesRes.data ?? []) as SequenceWithAccount[];

  const stats: Record<string, SequenceStats> = {};
  if (sequences.length > 0) {
    const { data: runs } = await supabase
      .from("sequence_runs")
      .select("sequence_id, status")
      .in("sequence_id", sequences.map((s) => s.id));

    for (const run of runs ?? []) {
      const id = run.sequence_id as string;
      stats[id] ??= { total: 0, inFlow: 0 };
      stats[id].total++;
      if (
        ["running", "waiting_reply", "waiting_postback", "waiting_delay"].includes(
          run.status as string
        )
      ) {
        stats[id].inFlow++;
      }
    }
  }

  return <SequencesManager sequences={sequences} stats={stats} />;
}
