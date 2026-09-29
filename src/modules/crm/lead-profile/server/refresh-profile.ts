import { getFullUserProfile } from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

/**
 * Busca e grava o perfil completo do lead (foto, nome, seguidores, se segue
 * a conta, se é verificado) na conversa. Sempre best effort: falha aqui
 * nunca pode derrubar a captura de mensagem nem a importação de histórico.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Busca o perfil de `igSenderId` na Graph API e grava em `conversations`.
 * Grava `ig_profile_fetched_at` mesmo quando a busca falha (permissão ainda
 * não concedida, rede, etc.): sem isso, toda mensagem nova do mesmo lead
 * tentaria de novo e falharia do mesmo jeito.
 */
export async function refreshLeadProfile(
  admin: AdminClient,
  account: IgAccount,
  igSenderId: string
): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const patch: Record<string, unknown> = { ig_profile_fetched_at: fetchedAt };

  try {
    const token = await getFreshToken(admin, account);
    const profile = await getFullUserProfile(token, igSenderId);
    // Só sobrescreve o @ quando a Meta devolveu um: não apaga o que já foi
    // gravado pela 1ª mensagem só porque esta busca não trouxe o campo.
    if (profile.username) patch.ig_sender_username = profile.username;
    patch.ig_profile_name = profile.name;
    patch.ig_profile_pic_url = profile.profilePicUrl;
    patch.ig_follower_count = profile.followerCount;
    patch.ig_follows_business = profile.followsBusiness;
    patch.ig_is_verified = profile.isVerified;
  } catch (err) {
    console.warn(
      "[crm] falha ao buscar perfil do lead:",
      err instanceof Error ? err.message : err
    );
  }

  await admin
    .from("conversations")
    .update(patch)
    .eq("account_id", account.id)
    .eq("ig_sender_id", igSenderId);
}

/**
 * Preenche o perfil de conversas antigas que ainda não têm
 * `ig_profile_fetched_at` (feitas antes desta feature, ou recém-criadas pela
 * importação de histórico). Processa em lotes pequenos: cada linha gasta 1
 * chamada à Graph API.
 */
export async function backfillLeadProfiles(
  admin: AdminClient,
  accountId: string,
  limit = 20
): Promise<number> {
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<IgAccount>();
  if (!account) return 0;

  const { data } = await admin
    .from("conversations")
    .select("ig_sender_id")
    .eq("account_id", accountId)
    .is("ig_profile_fetched_at", null)
    .limit(limit);
  const pending = (data ?? []) as { ig_sender_id: string }[];

  for (const row of pending) {
    await refreshLeadProfile(admin, account, row.ig_sender_id);
  }
  return pending.length;
}
