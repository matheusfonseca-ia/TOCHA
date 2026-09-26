import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { Button } from "@/components/ui/button";
import { withSyncedProfiles } from "@/lib/meta/account-profile";
import { createClient } from "@/lib/supabase/server";
import type { Rule } from "@/types/database";

export default async function NovaSequenciaPage() {
  const supabase = createClient();

  const [{ data: storedAccounts }, { data: rules }, { data: sequences }] = await Promise.all([
    supabase
      .from("ig_accounts")
      .select("id, ig_username, profile_picture_url, access_token_enc")
      .eq("status", "active")
      .order("connected_at"),
    // Automações para o nó "Automação" e o gatilho do editor (RLS limita ao usuário)
    supabase.from("rules").select("*").order("created_at"),
    // Workflows para o nó "Ir para workflow" (RLS idem)
    supabase.from("sequences").select("id, account_id, name").order("name"),
  ]);

  // O @ pode ter mudado no Instagram: o link ig.me de referência usa o atual.
  const accounts = await withSyncedProfiles(supabase, storedAccounts ?? []);

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
    />
  );
}
