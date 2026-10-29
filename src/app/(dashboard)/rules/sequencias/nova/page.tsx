import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { listTagOptionsForEditor } from "@/modules/crm/server";
import { stageOptionsFromRows } from "@/modules/crm/pipeline/services/pipeline.queries";
import type { Rule } from "@/types/database";

export default async function NovaSequenciaPage() {
  const supabase = createClient();

  const [{ data: storedAccounts }, { data: rules }, { data: sequences }, tags, { data: stageRows }] =
    await Promise.all([
      supabase
        .from("ig_accounts")
        .select("id, ig_username, profile_picture_url")
        .eq("status", "active")
        .order("connected_at"),
      // Automações para o nó "Automação" e o gatilho do editor (RLS limita ao usuário)
      supabase.from("rules").select("*").order("created_at"),
      // Workflows para o nó "Ir para workflow" (RLS idem). `graph` também: o
      // editor lê o gatilho de link de cada um pra sugerir um código inédito.
      supabase.from("sequences").select("id, account_id, name, graph").order("name"),
      // Catálogo de tags do CRM, para o autocomplete dos nós de dados (RLS idem)
      listTagOptionsForEditor(supabase),
      // Etapas dos funis para o nó "Mover para etapa" (RLS idem)
      supabase.from("pipeline_stages").select("id, name, pipelines(name, account_id)").order("position"),
    ]);

  // @ salvo no banco: sem chamada à Graph API a cada abertura do editor
  // (a sincronização do perfil fica na tela Contas). O token nem é lido aqui.
  const accounts = storedAccounts ?? [];

  if (accounts.length === 0) {
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

  return (
    <SequenceEditor
      accounts={accounts}
      rules={(rules ?? []) as Rule[]}
      sequences={sequences ?? []}
      tags={tags}
      stages={stageOptionsFromRows(stageRows)}
    />
  );
}
