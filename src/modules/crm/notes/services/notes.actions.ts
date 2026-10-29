"use server";

import { ownedAccountId as ownAccountId } from "@/lib/auth/ownership";
import { activeUserId } from "@/lib/auth/require-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_TEXT = 2000;
const MAX_SENDER_ID = 64;
const NO_ACCESS = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";

export type NoteActionResult = { ok: true } | { error: string };

async function ownNoteAccountId(noteId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_notes")
    .select("account_id")
    .eq("id", noteId)
    .maybeSingle<{ account_id: string }>();
  return data?.account_id ?? null;
}

/** Nota interna por contato: nunca é enviada ao Instagram. */
export async function createNote(
  accountId: string,
  igSenderId: string,
  text: string
): Promise<NoteActionResult> {
  const cleanText = typeof text === "string" ? text.trim().slice(0, MAX_TEXT) : "";
  if (!cleanText) return { error: "Escreva a nota." };
  const userId = await activeUserId();
  if (!userId) return { error: NO_ACCESS };
  if (!(await ownAccountId(accountId))) return { error: "Conta não encontrada." };
  // A nota é de um contato que tem conversa nesta conta (sem nota órfã).
  if (typeof igSenderId !== "string" || !igSenderId || igSenderId.length > MAX_SENDER_ID) {
    return { error: "Contato não encontrado." };
  }
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("account_id", accountId)
    .eq("ig_sender_id", igSenderId)
    .maybeSingle<{ id: string }>();
  if (!conversation) return { error: "Contato não encontrado." };

  const { error } = await createAdminClient()
    .from("crm_notes")
    .insert({ account_id: accountId, ig_sender_id: igSenderId, text: cleanText, author_id: userId });
  if (error) return { error: "Não foi possível salvar a nota." };
  return { ok: true };
}

export async function updateNote(noteId: string, text: string): Promise<NoteActionResult> {
  const cleanText = typeof text === "string" ? text.trim().slice(0, MAX_TEXT) : "";
  if (!cleanText) return { error: "Escreva a nota." };
  if (!(await activeUserId())) return { error: NO_ACCESS };
  if (!(await ownNoteAccountId(noteId))) return { error: "Nota não encontrada." };

  const { error } = await createAdminClient()
    .from("crm_notes")
    .update({ text: cleanText, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) return { error: "Não foi possível salvar a nota." };
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<NoteActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS };
  if (!(await ownNoteAccountId(noteId))) return { error: "Nota não encontrada." };
  const { error } = await createAdminClient().from("crm_notes").delete().eq("id", noteId);
  if (error) return { error: "Não foi possível excluir a nota." };
  return { ok: true };
}
