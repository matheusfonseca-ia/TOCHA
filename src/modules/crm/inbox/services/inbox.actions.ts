"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Abrir a conversa zera as não lidas. O dono só tem leitura em
 * `conversations` pelo RLS: a checagem de posse é feita com o client dele e
 * a escrita com a service role.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; unread_count: number }>();
  if (!data || !data.unread_count) return;

  await createAdminClient().from("conversations").update({ unread_count: 0 }).eq("id", data.id);
}
