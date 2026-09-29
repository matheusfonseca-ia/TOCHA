import { loadContact, saveContact } from "@/lib/contacts/repository";
import type { createAdminClient } from "@/lib/supabase/admin";

import { paletteColorForIndex } from "../utils/palette";
import { cleanTagName, dedupeTagsCaseInsensitive, sameTag } from "../utils/normalize-tag";
import type { CrmTag, TagColor } from "../types";

/**
 * Escrita do catálogo de tags e propagação em `contacts.tags`. Sempre com a
 * service role: a server action confere a posse da conta com o client do
 * usuário antes de chamar qualquer função daqui (padrão de
 * `inbox.actions.ts` / `flow-data.ts`).
 */

type AdminClient = ReturnType<typeof createAdminClient>;

function missingTableHint(message: string): string {
  return /crm_tags/.test(message) && /does not exist|schema cache|relation/i.test(message)
    ? `${message} (aplique a migration 0012_crm_tags.sql)`
    : message;
}

export async function listTagCatalog(admin: AdminClient, accountId: string): Promise<CrmTag[]> {
  const { data, error } = await admin
    .from("crm_tags")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) throw new Error(missingTableHint(error.message));
  return (data ?? []) as CrmTag[];
}

/**
 * 1ª abertura do gerenciador: se a conta ainda não tem catálogo, monta um a
 * partir das tags já gravadas em `contacts.tags` (sem duplicar por
 * maiúscula/acento) e alinha a grafia de todos os contatos com a escolhida
 * como canônica.
 */
export async function ensureTagCatalog(admin: AdminClient, accountId: string): Promise<CrmTag[]> {
  const existing = await listTagCatalog(admin, accountId);
  if (existing.length > 0) return existing;

  const { data: contactsData, error } = await admin
    .from("contacts")
    .select("tags")
    .eq("account_id", accountId);
  if (error) throw new Error(missingTableHint(error.message));

  const allTags = ((contactsData ?? []) as { tags: string[] | null }[]).flatMap((c) => c.tags ?? []);
  const canonical = dedupeTagsCaseInsensitive(allTags);
  if (canonical.length === 0) return [];

  const rows = canonical.map((name, i) => ({
    account_id: accountId,
    name,
    color: paletteColorForIndex(i),
  }));
  const { data: inserted, error: insertError } = await admin.from("crm_tags").insert(rows).select("*");
  if (insertError) throw new Error(missingTableHint(insertError.message));

  // Alinha a grafia dos contatos com a forma canônica escolhida (variantes de
  // maiúscula/acento diferentes da 1ª ocorrência viram a mesma tag).
  const variants = new Set(allTags.map((t) => cleanTagName(t))
    .filter((t) => t && !canonical.includes(t)));
  for (const variant of variants) {
    const canonicalName = canonical.find((c) => sameTag(c, variant));
    if (canonicalName && canonicalName !== variant) {
      await admin.rpc("crm_tag_rename", {
        p_account_id: accountId,
        p_old_name: variant,
        p_new_name: canonicalName,
      });
    }
  }

  return (inserted ?? []) as CrmTag[];
}

export async function createTagInCatalog(
  admin: AdminClient,
  accountId: string,
  name: string,
  color: TagColor
): Promise<{ tag: CrmTag | null; error: string | null }> {
  const clean = cleanTagName(name);
  if (!clean) return { tag: null, error: "Escreva um nome para a tag." };

  const existing = await listTagCatalog(admin, accountId);
  if (existing.some((t) => sameTag(t.name, clean))) {
    return { tag: null, error: "Já existe uma tag com esse nome." };
  }

  const { data, error } = await admin
    .from("crm_tags")
    .insert({ account_id: accountId, name: clean, color })
    .select("*")
    .maybeSingle<CrmTag>();
  if (error) return { tag: null, error: missingTableHint(error.message) };
  return { tag: data, error: null };
}

export async function renameTagInCatalog(
  admin: AdminClient,
  accountId: string,
  tagId: string,
  oldName: string,
  newName: string
): Promise<{ error: string | null }> {
  const clean = cleanTagName(newName);
  if (!clean) return { error: "Escreva um nome para a tag." };
  if (sameTag(oldName, clean)) {
    // Só mudou capitalização/acento do próprio nome: grava e propaga mesmo assim.
  } else {
    const existing = await listTagCatalog(admin, accountId);
    if (existing.some((t) => t.id !== tagId && sameTag(t.name, clean))) {
      return { error: "Já existe uma tag com esse nome." };
    }
  }

  const { error } = await admin.from("crm_tags").update({ name: clean }).eq("id", tagId).eq("account_id", accountId);
  if (error) return { error: missingTableHint(error.message) };

  await admin.rpc("crm_tag_rename", { p_account_id: accountId, p_old_name: oldName, p_new_name: clean });
  return { error: null };
}

export async function updateTagColorInCatalog(
  admin: AdminClient,
  accountId: string,
  tagId: string,
  color: TagColor
): Promise<{ error: string | null }> {
  const { error } = await admin.from("crm_tags").update({ color }).eq("id", tagId).eq("account_id", accountId);
  return { error: error ? missingTableHint(error.message) : null };
}

export async function deleteTagFromCatalog(
  admin: AdminClient,
  accountId: string,
  tagId: string,
  name: string
): Promise<{ error: string | null }> {
  const { error } = await admin.from("crm_tags").delete().eq("id", tagId).eq("account_id", accountId);
  if (error) return { error: missingTableHint(error.message) };

  await admin.rpc("crm_tag_remove", { p_account_id: accountId, p_tag_name: name });
  return { error: null };
}

/** Aplica/remove uma tag num lead; cria a linha em `contacts` se ele ainda não tiver uma. */
export async function setContactTag(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  username: string | null,
  tagName: string,
  action: "add" | "remove"
): Promise<void> {
  const contact = await loadContact(admin, accountId, senderId);
  const clean = cleanTagName(tagName);
  const others = contact.tags.filter((t) => !sameTag(t, clean));
  await saveContact(admin, accountId, senderId, {
    ig_username: username ?? contact.ig_username,
    fields: contact.fields,
    tags: action === "add" ? [...others, clean] : others,
  });
}
