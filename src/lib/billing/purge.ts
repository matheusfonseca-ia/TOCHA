import { isAccessStatus, isOwner, type QueryClient } from "@/lib/billing/access";

/**
 * Exclusão LGPD: 30 dias depois do cancelamento, apaga os arquivos do
 * `crm-uploads` e o usuário do Auth. O `on delete cascade` a partir de
 * auth.users → ig_accounts leva contatos, conversas, tokens e o resto.
 * Reconfere o status na hora: quem reativou não é apagado.
 */
export interface PurgeDeps {
  admin: QueryClient;
  removeUploads(accountId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  now?: () => Date;
}

export async function purgeExpiredUsers(deps: PurgeDeps): Promise<{ purged: string[] }> {
  // "Nunca apagar o dono" depende desta variável: sem ela isOwner() é sempre
  // false, e uma assinatura de teste do próprio dono seria apagada em 30 dias.
  if (!process.env.FALOW_OWNER_USER_ID?.trim()) {
    throw new Error("FALOW_OWNER_USER_ID não configurado: o purge se recusa a rodar.");
  }
  const now = (deps.now ?? (() => new Date()))();
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, status, purge_after")
    .lt("purge_after", now.toISOString());
  const rows = (data ?? []) as { user_id: string; status: string; purge_after: string | null }[];

  const purged: string[] = [];
  for (const row of rows) {
    if (!row.purge_after || isOwner(row.user_id) || isAccessStatus(row.status)) continue;
    try {
      const { data: accounts } = await deps.admin.from("ig_accounts").select("id").eq("user_id", row.user_id);
      for (const account of (accounts ?? []) as { id: string }[]) await deps.removeUploads(account.id);
      await deps.deleteUser(row.user_id);
      purged.push(row.user_id);
    } catch (err) {
      console.error(`[purge] ${row.user_id} falhou:`, err instanceof Error ? err.message : err);
    }
  }
  return { purged };
}
