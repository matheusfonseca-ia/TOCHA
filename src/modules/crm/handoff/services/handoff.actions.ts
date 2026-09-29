"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { setTakeover } from "../server/takeover";

/** Confere a posse da conversa com o client do usuário (RLS) antes de escrever. */
async function ownConversationId(conversationId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

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
