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
 * Intervalo mínimo entre duas sincronizações de perfil da mesma conta. @ e
 * foto mudam raramente; sem isto cada render de /accounts e do editor de
 * workflow esperava 1 chamada à Graph por conta (até 15s se a Meta estiver
 * lenta) e gastava cota da conta do cliente.
 *
 * A marca fica na memória do isolate do Worker (sem coluna no banco): um
 * isolate novo sincroniza de novo na primeira render, o que é barato. O
 * portão de seguir (gate.ts) continua sincronizando quando o @ importa.
 */
export const PROFILE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const lastProfileSync = new Map<string, number>();

/** Só para testes: esquece as marcas de sincronização. */
export function resetProfileSyncThrottle(): void {
  lastProfileSync.clear();
}

/**
 * Versão para as páginas: recebe as contas com o token criptografado e
 * devolve só os campos de exibição (o token nunca segue para o client).
 * `db` precisa conseguir escrever em `ig_accounts` (service role): para o
 * usuário a tabela é só leitura (migration 0022). Conta sincronizada há
 * menos de PROFILE_SYNC_INTERVAL_MS devolve o que está no banco, sem Graph.
 */
export async function withSyncedProfiles<T extends AccountProfile & { access_token_enc: string }>(
  db: SupabaseClient,
  accounts: T[],
  options: { now?: number } = {}
): Promise<Omit<T, "access_token_enc">[]> {
  const now = options.now ?? Date.now();
  return Promise.all(
    accounts.map(async ({ access_token_enc, ...account }) => {
      const last = lastProfileSync.get(account.id);
      if (last !== undefined && now - last < PROFILE_SYNC_INTERVAL_MS) return account;
      let token: string;
      try {
        token = decryptToken(access_token_enc);
      } catch {
        return account;
      }
      // Marca antes da chamada: renders simultâneas não disparam a mesma
      // consulta, e falha (token inválido) também espera o intervalo.
      lastProfileSync.set(account.id, now);
      const synced = await syncAccountProfile(db, account, token);
      return { ...account, ...synced };
    })
  );
}
