"use server";

import { sendMarkSeen } from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

/**
 * Abrir a conversa zera as não lidas. O dono só tem leitura em
 * `conversations` pelo RLS: a checagem de posse é feita com o client dele e
 * a escrita com a service role. Também marca como "visto" no Instagram
 * (best effort, confirmado na Fase 0: `sender_action: mark_seen`).
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, unread_count, account_id, ig_sender_id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; unread_count: number; account_id: string; ig_sender_id: string }>();
  if (!data || !data.unread_count) return;

  const admin = createAdminClient();
  await admin.from("conversations").update({ unread_count: 0 }).eq("id", data.id);

  try {
    const { data: account } = await admin
      .from("ig_accounts")
      .select("*")
      .eq("id", data.account_id)
      .maybeSingle<IgAccount>();
    if (account) {
      const token = await getFreshToken(admin, account);
      await sendMarkSeen(token, data.ig_sender_id);
    }
  } catch {
    // best effort: "visto" nunca pode travar a leitura da conversa
  }
}
