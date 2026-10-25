"use server";

import { ownedConversationId as ownConversationId } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";

import { setTakeover } from "../server/takeover";

/** Botão "Assumir conversa": para as automações para esta pessoa. */
export async function assumeConversation(conversationId: string): Promise<void> {
  if (!(await ownConversationId(conversationId))) return;
  await setTakeover(createAdminClient(), conversationId, true);
}

/** Botão "Devolver ao bot": as automações voltam a rodar normalmente. */
export async function returnToBot(conversationId: string): Promise<void> {
  if (!(await ownConversationId(conversationId))) return;
  await setTakeover(createAdminClient(), conversationId, false);
}
