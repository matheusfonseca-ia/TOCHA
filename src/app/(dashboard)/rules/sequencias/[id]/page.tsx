import { notFound } from "next/navigation";

import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { withSyncedProfiles } from "@/lib/meta/account-profile";
import { createClient } from "@/lib/supabase/server";
import type { Rule } from "@/types/database";
import type { Sequence, SequenceRun } from "@/types/sequence";

export default async function EditarSequenciaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const [{ data: sequence }, { data: storedAccounts }, { data: runs }, { data: rules }, { data: sequences }] =
    await Promise.all([
      // RLS garante que só sequências das contas do usuário aparecem aqui
      supabase.from("sequences").select("*").eq("id", params.id).maybeSingle(),
      supabase
        .from("ig_accounts")
        .select("id, ig_username, profile_picture_url, access_token_enc")
        .eq("status", "active")
        .order("connected_at"),
      // Últimas execuções pro painel de execuções do editor (RLS idem)
      supabase
        .from("sequence_runs")
        .select("*")
        .eq("sequence_id", params.id)
        .order("updated_at", { ascending: false })
        .limit(50),
      // Automações para o nó "Automação" e o gatilho do editor (RLS idem)
      supabase.from("rules").select("*").order("created_at"),
      // Workflows para o nó "Ir para workflow" (RLS idem)
      supabase.from("sequences").select("id, account_id, name").order("name"),
    ]);

  if (!sequence) notFound();

  // O @ pode ter mudado no Instagram: o link ig.me de referência usa o atual.
  const accounts = await withSyncedProfiles(supabase, storedAccounts ?? []);

  return (
    <SequenceEditor
      accounts={accounts}
      sequence={sequence as Sequence}
      runs={(runs ?? []) as SequenceRun[]}
      rules={(rules ?? []) as Rule[]}
      sequences={sequences ?? []}
    />
  );
}
