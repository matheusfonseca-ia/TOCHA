"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_TITLE = 40;
const MAX_TEXT = 1000;

export type QuickReplyActionResult = { ok: true } | { error: string };

/** Confere que a conta é do usuário logado antes de qualquer escrita. */
async function ownAccountId(accountId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("ig_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function createQuickReply(
  accountId: string,
  title: string,
  text: string
): Promise<QuickReplyActionResult> {
  const cleanTitle = title.trim().slice(0, MAX_TITLE);
  const cleanText = text.trim().slice(0, MAX_TEXT);
  if (!cleanTitle || !cleanText) return { error: "Preencha o atalho e o texto." };
  if (!(await ownAccountId(accountId))) return { error: "Conta não encontrada." };

  const { error } = await createAdminClient()
    .from("quick_replies")
    .insert({ account_id: accountId, title: cleanTitle, text: cleanText });
  if (error) return { error: "Não foi possível criar a resposta rápida." };
  return { ok: true };
}

async function ownQuickReplyAccountId(quickReplyId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("quick_replies")
    .select("account_id")
    .eq("id", quickReplyId)
    .maybeSingle<{ account_id: string }>();
  return data?.account_id ?? null;
}

export async function updateQuickReply(
  quickReplyId: string,
  title: string,
  text: string
): Promise<QuickReplyActionResult> {
  const cleanTitle = title.trim().slice(0, MAX_TITLE);
  const cleanText = text.trim().slice(0, MAX_TEXT);
  if (!cleanTitle || !cleanText) return { error: "Preencha o atalho e o texto." };
  if (!(await ownQuickReplyAccountId(quickReplyId))) return { error: "Resposta rápida não encontrada." };

  const { error } = await createAdminClient()
    .from("quick_replies")
    .update({ title: cleanTitle, text: cleanText, updated_at: new Date().toISOString() })
    .eq("id", quickReplyId);
  if (error) return { error: "Não foi possível salvar a resposta rápida." };
  return { ok: true };
}

export async function deleteQuickReply(quickReplyId: string): Promise<QuickReplyActionResult> {
  if (!(await ownQuickReplyAccountId(quickReplyId))) return { error: "Resposta rápida não encontrada." };
  const { error } = await createAdminClient().from("quick_replies").delete().eq("id", quickReplyId);
  if (error) return { error: "Não foi possível excluir a resposta rápida." };
  return { ok: true };
}
