import Link from "next/link";
import { Instagram } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ResponderComentarioBuilder } from "@/components/rules/responder-comentario-builder";
import { Button } from "@/components/ui/button";
import { decryptToken } from "@/lib/crypto";
import { listRecentMedia } from "@/lib/meta/graph";
import { createClient } from "@/lib/supabase/server";
import type { MediaRef } from "@/types/database";

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

  // Mídia recente de cada conta, pro seletor de publicação/Reel do gatilho.
  // Nunca expõe o token ao client — só a lista de mídia já resolvida.
  const accountsWithMedia = await Promise.all(
    accounts.map(async (account) => {
      let media: MediaRef[] = [];
      try {
        const token = decryptToken(account.access_token_enc);
        const items = await listRecentMedia(token);
        media = items.map((item) => ({
          id: item.id,
          media_type: item.media_type,
          thumbnail_url:
            item.media_type === "VIDEO"
              ? (item.thumbnail_url ?? item.media_url)
              : item.media_url,
          permalink: item.permalink,
          caption: item.caption,
        }));
      } catch (err) {
        console.warn(
          `[rules/nova/responder-comentario] falha ao buscar mídia de @${account.ig_username}:`,
          err instanceof Error ? err.message : err
        );
      }
      return {
        id: account.id,
        ig_username: account.ig_username,
        profile_picture_url: account.profile_picture_url,
        media,
      };
    })
  );

  return <ResponderComentarioBuilder accounts={accountsWithMedia} />;
}
