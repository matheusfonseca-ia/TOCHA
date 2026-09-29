import { loadContact, saveContact } from "@/lib/contacts/repository";
import { isValidFieldKey, STORED_FIELD_VALUE_MAX } from "@/lib/sequences/fields";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Edição dos "Dados coletados" da ficha do lead (`contacts.fields`). Mesma
 * validação de chave usada pelos nós Coletar dado / Definir campo
 * (`src/lib/sequences/fields.ts`), para o campo continuar utilizável em
 * `{{campo}}` e na Condição do workflow depois de editado pelo painel.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export async function setContactField(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  username: string | null,
  key: string,
  value: string
): Promise<{ error: string | null }> {
  if (!isValidFieldKey(key)) {
    return { error: "Nome do campo inválido: use letras minúsculas, números e _ (até 40)." };
  }
  const contact = await loadContact(admin, accountId, senderId);
  await saveContact(admin, accountId, senderId, {
    ig_username: username ?? contact.ig_username,
    fields: { ...contact.fields, [key]: value.slice(0, STORED_FIELD_VALUE_MAX) },
    tags: contact.tags,
  });
  return { error: null };
}

export async function removeContactField(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  key: string
): Promise<void> {
  const contact = await loadContact(admin, accountId, senderId);
  const fields = { ...contact.fields };
  delete fields[key];
  await saveContact(admin, accountId, senderId, {
    ig_username: contact.ig_username,
    fields,
    tags: contact.tags,
  });
}
