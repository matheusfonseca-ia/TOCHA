import { notFound } from "next/navigation";

import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { createClient } from "@/lib/supabase/server";
import type { Rule } from "@/types/database";
import type { Sequence, SequenceRun } from "@/types/sequence";

export default async function EditarSequenciaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: sequence }, { data: accounts }, { data: runs }, { data: rules }] = await Promise.all([
    // RLS garante que só sequências das contas do usuário aparecem aqui
    supabase.from("sequences").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("ig_accounts")
      .select("id, ig_username, profile_picture_url")
      .eq("status", "active")
      .order("connected_at"),
    // Últimas execuções pro painel de execuções do editor (RLS idem)
    supabase
      .from("sequence_runs")
      .select("*")
      .eq("sequence_id", params.id)
      .order("updated_at", { ascending: false })
      .limit(50),
    // Automações para o nó "Automação" do editor (RLS idem)
    supabase.from("rules").select("*").order("created_at"),
  ]);

  if (!sequence) notFound();

  return (
    <SequenceEditor
      accounts={accounts ?? []}
      sequence={sequence as Sequence}
      runs={(runs ?? []) as SequenceRun[]}
      rules={(rules ?? []) as Rule[]}
    />
  );
}
