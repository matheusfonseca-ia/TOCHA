"use server";

import { createClient } from "@/lib/supabase/server";
import type { SequenceVersion } from "@/types/sequence";

/**
 * Últimas versões salvas de um workflow, mais recentes primeiro. RLS ("own
 * sequence versions", ver supabase/migrations/0008_sequence_versions.sql) já
 * garante que só aparecem versões de contas do usuário logado.
 */
export async function getSequenceVersions(sequenceId: string): Promise<SequenceVersion[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("sequence_versions")
    .select("id, sequence_id, name, graph, is_active, created_at")
    .eq("sequence_id", sequenceId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (data ?? []) as SequenceVersion[];
}
