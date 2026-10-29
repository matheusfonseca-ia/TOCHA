"use server";

import { ownedConversationId as ownConversationId } from "@/lib/auth/ownership";
import { activeUserId } from "@/lib/auth/require-access";
import { createAdminClient } from "@/lib/supabase/admin";

import type { ConversationStatus } from "../../shared/types/conversation";

const STATUSES: readonly ConversationStatus[] = ["open", "done"];

/** Concluir / reabrir a conversa (item 10, Fase 7). */
export async function setConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  if (!STATUSES.includes(status)) return;
  if (!(await activeUserId())) return;
  if (!(await ownConversationId(conversationId))) return;
  await createAdminClient().from("conversations").update({ status }).eq("id", conversationId);
}
