"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_TEXT = 2000;

export type NoteActionResult = { ok: true } | { error: string };

async function ownAccountId(accountId: string): Promise<string | null> {
  const { data } = await createClient()
    .from("ig_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function ownNoteAccountId(noteId: string): Promise<string | null> {
  const { data } = await createClient()
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
  const cleanText = text.trim().slice(0, MAX_TEXT);
  if (!cleanText) return { error: "Escreva a nota." };
  if (!(await ownAccountId(accountId))) return { error: "Conta não encontrada." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await createAdminClient()
    .from("crm_notes")
    .insert({ account_id: accountId, ig_sender_id: igSenderId, text: cleanText, author_id: user?.id ?? null });
  if (error) return { error: "Não foi possível salvar a nota." };
  return { ok: true };
}

export async function updateNote(noteId: string, text: string): Promise<NoteActionResult> {
  const cleanText = text.trim().slice(0, MAX_TEXT);
  if (!cleanText) return { error: "Escreva a nota." };
  if (!(await ownNoteAccountId(noteId))) return { error: "Nota não encontrada." };

  const { error } = await createAdminClient()
    .from("crm_notes")
    .update({ text: cleanText, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) return { error: "Não foi possível salvar a nota." };
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<NoteActionResult> {
  if (!(await ownNoteAccountId(noteId))) return { error: "Nota não encontrada." };
  const { error } = await createAdminClient().from("crm_notes").delete().eq("id", noteId);
  if (error) return { error: "Não foi possível excluir a nota." };
  return { ok: true };
}
