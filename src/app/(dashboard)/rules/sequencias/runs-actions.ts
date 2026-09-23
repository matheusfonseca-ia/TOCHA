"use server";

import { createClient } from "@/lib/supabase/server";
import type { SequenceRun } from "@/types/sequence";

/**
 * Últimas execuções de uma sequência, mais recentes primeiro. RLS
 * ("own sequence runs", ver supabase/migrations/0001_init.sql) já garante
 * que só aparecem execuções de contas do usuário logado.
 */
export async function getSequenceRuns(sequenceId: string): Promise<SequenceRun[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sequence_runs")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  return (data ?? []) as SequenceRun[];
}
