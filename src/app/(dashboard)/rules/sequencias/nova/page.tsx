import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { SequenceEditor } from "@/components/sequences/sequence-editor";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function NovaSequenciaPage() {
  const supabase = createClient();

  const { data: accounts } = await supabase
    .from("ig_accounts")
    .select("id, ig_username")
    .eq("status", "active")
    .order("connected_at");

  if ((accounts ?? []).length === 0) {
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

  return <SequenceEditor accounts={accounts ?? []} />;
}
