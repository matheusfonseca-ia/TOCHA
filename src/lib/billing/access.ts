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
  const owner = process.env.FALOW_OWNER_USER_ID;
  return Boolean(owner && userId && userId === owner);
}

export function isAccessStatus(status: string | null | undefined): boolean {
  return (ACCESS_STATUSES as readonly string[]).includes(status ?? "");
}

export async function hasActiveAccess(client: QueryClient, userId: string): Promise<boolean> {
  if (isOwner(userId)) return true;
  const { data } = await client
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return isAccessStatus((data as { status?: string } | null)?.status);
}

export async function accountHasAccess(client: QueryClient, accountId: string): Promise<boolean> {
  const { data } = await client
    .from("ig_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  const userId = (data as { user_id?: string } | null)?.user_id;
  return userId ? hasActiveAccess(client, userId) : false;
}
