import { decryptToken } from "@/lib/crypto";
import { listRecentMedia } from "@/lib/meta/graph";
import type { MediaRef } from "@/types/database";

export interface AccountWithMedia {
  id: string;
  ig_username: string;
  profile_picture_url: string | null;
  media: MediaRef[];
}

/**
 * Mídia recente de cada conta, para o seletor de publicação/Reel das
 * automações de comentário. Roda só no servidor: o token nunca vai ao
 * client, só a lista de mídia já resolvida. Falha numa conta vira lista vazia.
 */
export async function withRecentMedia(
  accounts: { id: string; ig_username: string; profile_picture_url: string | null; access_token_enc: string }[]
): Promise<AccountWithMedia[]> {
  return Promise.all(
    accounts.map(async (account) => {
      let media: MediaRef[] = [];
      try {
        const items = await listRecentMedia(decryptToken(account.access_token_enc));
        media = items.map((item) => ({
          id: item.id,
          media_type: item.media_type,
          thumbnail_url:
            item.media_type === "VIDEO" ? (item.thumbnail_url ?? item.media_url) : item.media_url,
          permalink: item.permalink,
          caption: item.caption,
        }));
      } catch (err) {
        console.warn(
          `[rules] falha ao buscar mídia de @${account.ig_username}:`,
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
}
