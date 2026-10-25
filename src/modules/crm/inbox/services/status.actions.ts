"use server";

import { ownedConversationId as ownConversationId } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ConversationStatus } from "../../shared/types/conversation";

/** Concluir / reabrir a conversa (item 10, Fase 7). */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  if (!(await ownConversationId(conversationId))) return;
  await createAdminClient().from("conversations").update({ status }).eq("id", conversationId);
}
