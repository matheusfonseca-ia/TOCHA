/**
 * Regra única de acesso do Falow multiusuário. Usada no middleware (painel),
 * no webhook da Meta (bot), no cron das sequências e no botão de IA.
 *
 * Sem import de client aqui: o middleware roda fora do contexto de Server
 * Component, então cada chamador passa o client que tem.
 */

export const ACCESS_STATUSES = ["active", "trialing", "past_due"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryClient = { from: (table: any) => any };

export function isOwner(userId: string | null | undefined): boolean {
  // trim: `echo id | vercel env add` deixa quebra de linha no fim do valor, e o
  // purge usa este mesmo valor para decidir quem nunca pode ser apagado.
  const owner = process.env.FALOW_OWNER_USER_ID?.trim();
  return Boolean(owner && userId && userId === owner);
}

export function isAccessStatus(status: string | null | undefined): boolean {
  return (ACCESS_STATUSES as readonly string[]).includes(status ?? "");
}

export async function hasActiveAccess(client: QueryClient, userId: string): Promise<boolean> {
  if (isOwner(userId)) return true;
  const { data, error } = await client
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  // Continua fail-closed, mas o log diz que foi falha de leitura, não "sem assinatura".
  if (error) {
    console.error(`[access] falha ao ler subscriptions do usuário ${userId}:`, error.message);
    return false;
  }
  return isAccessStatus((data as { status?: string } | null)?.status);
}

export async function accountHasAccess(client: QueryClient, accountId: string): Promise<boolean> {
  const { data, error } = await client
    .from("ig_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (error) {
    console.error(`[access] falha ao ler ig_accounts da conta ${accountId}:`, error.message);
    return false;
  }
  const userId = (data as { user_id?: string } | null)?.user_id;
  return userId ? hasActiveAccess(client, userId) : false;
}
