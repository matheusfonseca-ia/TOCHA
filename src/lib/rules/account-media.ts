import { decryptToken } from "@/lib/crypto";
import { listRecentMedia } from "@/lib/meta/graph";
import type { IgAccount, MediaRef } from "@/types/database";

export interface AccountWithMedia {
  id: string;
  ig_username: string;
  profile_picture_url: string | null;
  media: MediaRef[];
}

// Mídia lembrada por alguns minutos (por isolate do Worker): abrir e fechar
// o builder de comentário não gasta de novo a cota da Graph API do token,
// a mesma que o bot usa para responder. A chave inclui o fim do token
// cifrado: reconectar a conta (token novo) nunca reaproveita a lista antiga.
const MEDIA_TTL_MS = 5 * 60 * 1000;
const MEDIA_CACHE_MAX = 200;
const mediaCache = new Map<string, { media: MediaRef[]; until: number }>();

function cacheKey(account: { id: string; access_token_enc: string }): string {
  return `${account.id}:${account.access_token_enc.slice(-24)}`;
}

/** Só para testes. */
export function clearRecentMediaCache(): void {
  mediaCache.clear();
}

/**
 * Mídia recente de cada conta, para o seletor de publicação/Reel das
 * automações de comentário. Roda só no servidor: o token nunca vai ao
 * client, só a lista de mídia já resolvida. Falha numa conta vira lista vazia.
 *
 * Conta que não está ativa (desconectada ou expirada) devolve lista vazia SEM
 * descriptografar o token: linhas antigas ainda podem guardar o token do dono
 * anterior, e o @ pode ter sido reconectado por outro usuário.
 */
export async function withRecentMedia(
  accounts: {
    id: string;
    ig_username: string;
    profile_picture_url: string | null;
    access_token_enc: string;
    status: IgAccount["status"];
  }[]
): Promise<AccountWithMedia[]> {
  return Promise.all(
    accounts.map(async (account) => {
      let media: MediaRef[] = [];
      if (account.status !== "active") {
        return {
          id: account.id,
          ig_username: account.ig_username,
          profile_picture_url: account.profile_picture_url,
          media,
        };
      }
      const key = cacheKey(account);
      const cached = mediaCache.get(key);
      if (cached && cached.until > Date.now()) {
        return {
          id: account.id,
          ig_username: account.ig_username,
          profile_picture_url: account.profile_picture_url,
          media: cached.media,
        };
      }
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
        // Só o sucesso fica guardado: falha tenta de novo no próximo render.
        if (mediaCache.size >= MEDIA_CACHE_MAX) mediaCache.delete(mediaCache.keys().next().value as string);
        mediaCache.set(key, { media, until: Date.now() + MEDIA_TTL_MS });
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
