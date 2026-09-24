import type { createAdminClient } from "@/lib/supabase/admin";
import type { Contact } from "@/types/database";

/**
 * Acesso à tabela `contacts` a partir do runtime do webhook (service role).
 * Um contato por (conta, remetente); os campos são mesclados em JS e
 * gravados com upsert, então a 1ª gravação cria a linha.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type ContactSnapshot = Pick<Contact, "ig_username" | "fields" | "tags">;

export const EMPTY_CONTACT: ContactSnapshot = {
  ig_username: null,
  fields: {},
  tags: [],
};

function missingTableHint(message: string): string {
  return /contacts/.test(message) && /does not exist|schema cache|relation/i.test(message)
    ? `${message} (aplique a migration 0004_contacts_and_flow_data.sql)`
    : message;
}

/** Contato atual (ou vazio, se a pessoa ainda não tem ficha). */
export async function loadContact(
  admin: AdminClient,
  accountId: string,
  senderId: string
): Promise<ContactSnapshot> {
  const { data, error } = await admin
    .from("contacts")
    .select("ig_username, fields, tags")
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .maybeSingle<ContactSnapshot>();
  if (error) throw new Error(missingTableHint(error.message));
  if (!data) return { ...EMPTY_CONTACT };
  return {
    ig_username: data.ig_username ?? null,
    fields: data.fields ?? {},
    tags: data.tags ?? [],
  };
}

/** @ da pessoa guardado na conversa, quando conhecido. */
export async function loadConversationUsername(
  admin: AdminClient,
  accountId: string,
  senderId: string
): Promise<string | null> {
  const { data } = await admin
    .from("conversations")
    .select("ig_sender_username")
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .maybeSingle<{ ig_sender_username: string | null }>();
  return data?.ig_sender_username ?? null;
}

/** Grava o estado completo do contato (cria na 1ª vez). */
export async function saveContact(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  contact: ContactSnapshot
): Promise<void> {
  const { error } = await admin.from("contacts").upsert(
    {
      account_id: accountId,
      ig_sender_id: senderId,
      // Só manda o @ quando conhecido: nunca apaga um já gravado.
      ...(contact.ig_username ? { ig_username: contact.ig_username } : {}),
      fields: contact.fields,
      tags: contact.tags,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ig_sender_id" }
  );
  if (error) throw new Error(missingTableHint(error.message));
}
