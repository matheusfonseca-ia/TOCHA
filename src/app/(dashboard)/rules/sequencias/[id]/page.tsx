import { notFound } from "next/navigation";

import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { createClient } from "@/lib/supabase/server";
import { listTagOptionsForEditor } from "@/modules/crm/server";
import { stageOptionsFromRows } from "@/modules/crm/pipeline/services/pipeline.queries";
import type { Rule } from "@/types/database";
import type { Sequence, SequenceRun, SequenceVersion } from "@/types/sequence";

export default async function EditarSequenciaPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();

  const [
    { data: sequence },
    { data: storedAccounts },
    { data: runs },
    { data: rules },
    { data: sequences },
    { data: versions },
    tags,
    { data: stageRows },
  ] = await Promise.all([
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
    // Automações para o nó "Automação" e o gatilho do editor (RLS idem)
    supabase.from("rules").select("*").order("created_at"),
    // Workflows para o nó "Ir para workflow" (RLS idem). `graph` também: o
    // editor lê o gatilho de link de cada um pra sugerir um código inédito.
    supabase.from("sequences").select("id, account_id, name, graph").order("name"),
    // Últimas versões salvas pro painel de Histórico do editor (RLS idem)
    supabase
      .from("sequence_versions")
      .select("id, sequence_id, name, graph, is_active, created_at")
      .eq("sequence_id", params.id)
      .order("created_at", { ascending: false })
      .limit(30),
    // Catálogo de tags do CRM, para o autocomplete dos nós de dados (RLS idem)
    listTagOptionsForEditor(supabase),
    // Etapas dos funis para o nó "Mover para etapa" e a condição "Está na etapa" (RLS idem)
    supabase.from("pipeline_stages").select("id, name, pipelines(name, account_id)").order("position"),
  ]);

  if (!sequence) notFound();

  // @ salvo no banco: sem chamada à Graph API a cada abertura do editor
  // (a sincronização do perfil fica na tela Contas). O token nem é lido aqui.
  const accounts = storedAccounts ?? [];

  return (
    <SequenceEditor
      accounts={accounts}
      sequence={sequence as Sequence}
      runs={(runs ?? []) as SequenceRun[]}
      rules={(rules ?? []) as Rule[]}
      sequences={sequences ?? []}
      versions={(versions ?? []) as SequenceVersion[]}
      tags={tags}
      stages={stageOptionsFromRows(stageRows)}
    />
  );
}
