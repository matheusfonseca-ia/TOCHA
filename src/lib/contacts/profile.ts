import { getUserProfile } from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Busca o @ de quem está no fluxo na Graph API e guarda em
 * `conversations.ig_sender_username`, para as próximas vezes não
 * consultarem de novo. O webhook de DM não traz o @, então sem isso
 * `{{username}}` sairia vazio. Falha (permissão, rede) devolve null.
 */
export async function fetchAndStoreUsername(
  admin: AdminClient,
  account: IgAccount,
  senderId: string
): Promise<string | null> {
  try {
    const token = await getFreshToken(admin, account);
    const { username } = await getUserProfile(token, senderId);
    if (!username) return null;
    await admin
      .from("conversations")
      .update({ ig_sender_username: username })
      .eq("account_id", account.id)
      .eq("ig_sender_id", senderId);
    return username;
  } catch (err) {
    console.warn(
      "[contacts] não foi possível buscar o @ do contato:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
