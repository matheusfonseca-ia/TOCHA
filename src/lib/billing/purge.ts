import { accessGrantOf, hasActiveAccess, isAccessStatus, isAdmin, isCourtesyValid, type QueryClient } from "@/lib/billing/access";

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
  // Mesmo valor (já com trim) que isOwner() usa, senão o guard passa e o dono não é reconhecido.
  const owner = process.env.FALOW_OWNER_USER_ID?.trim();
  if (!owner) {
    throw new Error("FALOW_OWNER_USER_ID não configurado: o purge se recusa a rodar.");
  }
  const now = (deps.now ?? (() => new Date()))();
  // Só `canceled` é apagado (incomplete/unpaid/paused nunca agendam purge). O
  // `.neq` é a segunda camada de proteção do dono, além do isAdmin() por linha.
  const { data } = await deps.admin
    .from("subscriptions")
    .select("user_id, status, purge_after")
    .eq("status", "canceled")
    .neq("user_id", owner)
    .lt("purge_after", now.toISOString());
  const rows = (data ?? []) as { user_id: string; status: string; purge_after: string | null }[];

  const purged: string[] = [];
  for (const row of rows) {
    if (!row.purge_after || isAdmin(row.user_id) || isAccessStatus(row.status)) continue;
    try {
      // Releitura logo antes do que não tem volta: um webhook de reativação pode
      // ter chegado depois do select acima. Qualquer dúvida (inclusive erro) = pula.
      const { data: current, error: rereadError } = await deps.admin
        .from("subscriptions")
        .select("status, purge_after")
        .eq("user_id", row.user_id)
        .maybeSingle();
      const fresh = current as { status?: string; purge_after?: string | null } | null;
      // Date (não comparação de string): o Postgres devolve o timestamptz em outro formato; NaN também pula.
      if (rereadError || !fresh || fresh.status !== "canceled" || !fresh.purge_after || !(new Date(fresh.purge_after) < now)) continue;

      // Admin e cortesia válida nunca são apagados (bloqueio + canceled segue o purge normal).
      // Erro ao ler a cortesia = dúvida = pula (hasActiveAccess é fail-closed pra ACESSO, o que aqui viraria "pode apagar").
      const { grant, error: grantError } = await accessGrantOf(deps.admin, row.user_id);
      if (grantError) continue;
      if (isCourtesyValid(grant, now)) continue;
      if (await hasActiveAccess(deps.admin, row.user_id, now)) continue;

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
