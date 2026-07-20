import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ResponderDmBuilder } from "@/components/rules/responder-dm-builder";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function NovaAutomacaoResponderDmPage() {
  const supabase = createClient();

  const { data: accounts } = await supabase
    .from("ig_accounts")
    .select("id, ig_username, profile_picture_url")
    .eq("status", "active")
    .order("connected_at");

  if (!accounts || accounts.length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Conecte uma conta primeiro"
        description="Automações de DM precisam de uma conta do Instagram conectada."
      >
        <Button asChild>
          <Link href="/accounts">Conectar Instagram</Link>
        </Button>
      </EmptyState>
    );
  }

  return <ResponderDmBuilder accounts={accounts} />;
}
