"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { ConversationStatus } from "../../shared/types/conversation";

async function ownConversationId(conversationId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/** Concluir / reabrir a conversa (item 10, Fase 7). */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  if (!(await ownConversationId(conversationId))) return;
  await createAdminClient().from("conversations").update({ status }).eq("id", conversationId);
}
