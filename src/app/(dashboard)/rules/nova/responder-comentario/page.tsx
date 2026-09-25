import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ResponderComentarioBuilder } from "@/components/rules/responder-comentario-builder";
import { Button } from "@/components/ui/button";
import { withRecentMedia } from "@/lib/rules/account-media";
import { createClient } from "@/lib/supabase/server";

export default async function NovaAutomacaoResponderComentarioPage() {
  const supabase = createClient();

  const { data: accounts } = await supabase
    .from("ig_accounts")
    .select("id, ig_username, profile_picture_url, access_token_enc")
    .eq("status", "active")
    .order("connected_at");

  if (!accounts || accounts.length === 0) {
    return (
      <EmptyState
        icon={Instagram}
        title="Conecte uma conta primeiro"
        description="Automações de comentário precisam de uma conta do Instagram conectada."
      >
        <Button asChild>
          <Link href="/accounts">Conectar Instagram</Link>
        </Button>
      </EmptyState>
    );
  }

  return <ResponderComentarioBuilder accounts={await withRecentMedia(accounts)} />;
}
