import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptToken } from "@/lib/crypto";
import type { IgAccount } from "@/types/database";

import { getInstagramProfile } from "./oauth";

type AccountProfile = Pick<IgAccount, "id" | "ig_username" | "profile_picture_url">;

/**
 * O @ e a foto da conta mudam no Instagram sem aviso (nenhum webhook avisa) e
 * o Falow só gravava os dois ao conectar. Com o @ antigo, todo link montado a
 * partir dele (botão "Seguir perfil" do portão, link ig.me de referência)
 * aponta para um perfil que não existe mais. Busca o perfil atual, grava o
 * que mudou e devolve o @ de agora; falha (rede, token) devolve o salvo.
 */
export async function syncAccountProfile(
  db: SupabaseClient,
  account: AccountProfile,
  token: string
): Promise<AccountProfile> {
  try {
    const profile = await getInstagramProfile(token);
    const current = {
      id: account.id,
      ig_username: profile.username,
      profile_picture_url: profile.profilePictureUrl ?? account.profile_picture_url,
    };
    if (
      current.ig_username !== account.ig_username ||
      current.profile_picture_url !== account.profile_picture_url
    ) {
      await db
        .from("ig_accounts")
        .update({
          ig_username: current.ig_username,
          profile_picture_url: current.profile_picture_url,
        })
        .eq("id", account.id);
    }
    return current;
  } catch (err) {
    console.warn(
      `[accounts] não foi possível atualizar o perfil de @${account.ig_username}:`,
      err instanceof Error ? err.message : err
    );
    return account;
  }
}

/**
 * Versão para as páginas: recebe as contas com o token criptografado e
 * devolve só os campos de exibição (o token nunca segue para o client).
 */
export async function withSyncedProfiles<T extends AccountProfile & { access_token_enc: string }>(
  db: SupabaseClient,
  accounts: T[]
): Promise<Omit<T, "access_token_enc">[]> {
  return Promise.all(
    accounts.map(async ({ access_token_enc, ...account }) => {
      let token: string;
      try {
        token = decryptToken(access_token_enc);
      } catch {
        return account;
      }
      const synced = await syncAccountProfile(db, account, token);
      return { ...account, ...synced };
    })
  );
}
