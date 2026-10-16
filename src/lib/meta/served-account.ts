import { hasActiveAccess } from "@/lib/billing/access";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Conta que o bot deve atender: ativa **e** de um usuário com acesso
 * (assinatura em dia ou dono). Assinatura parada = bot calado, sem log em
 * `interactions` (o cliente não vê o painel enquanto isso).
 */
export async function findServedAccount(admin: AdminClient, igUserId: string): Promise<IgAccount | null> {
  if (!igUserId) return null;
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", igUserId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  if (!account) return null;
  if (!(await hasActiveAccess(admin, account.user_id))) {
    console.info(`[meta] @${account.ig_username} sem assinatura ativa: evento ignorado`);
    return null;
  }
  return account;
}
