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
  const { data: account, error } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", igUserId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  // Falha de leitura não é "conta desconhecida": lança para o webhook
  // devolver o evento à fila (dedupe liberado) em vez de descartá-lo calado.
  if (error) throw new Error(`Falha ao ler a conta do Instagram: ${error.message}`);
  if (!account) return null;
  if (!(await hasActiveAccess(admin, account.user_id))) {
    console.info(`[meta] @${account.ig_username} sem assinatura ativa: evento ignorado`);
    return null;
  }
  return account;
}
