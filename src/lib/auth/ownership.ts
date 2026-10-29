import { createClient } from "@/lib/supabase/server";

/**
 * Checagem de posse para server actions que escrevem com a service role.
 * Consulta com o client do usuário: o RLS só devolve a linha se ela for
 * dele. Nulo = não é dele (ou não existe) e a action não pode seguir.
 */
export async function ownedAccountId(accountId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ig_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function ownedConversationId(conversationId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
