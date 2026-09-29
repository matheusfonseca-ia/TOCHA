"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { INBOX_PATH } from "../../inbox/utils/href";
import {
  createTagInCatalog,
  deleteTagFromCatalog,
  ensureTagCatalog,
  renameTagInCatalog,
  setContactTag,
  updateTagColorInCatalog,
} from "../server/tags-repository";
import type { CrmTag, TagColor, TagWorkflowUsage } from "../types";
import { getTagWorkflowUsage as queryTagWorkflowUsage } from "./tags.queries";

/**
 * Server actions do catálogo de tags. Sempre no mesmo padrão do módulo:
 * confere a posse da conta com o client do usuário (RLS) e escreve com
 * `createAdminClient` (service role).
 */

async function assertOwnsAccount(accountId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data } = await supabase.from("ig_accounts").select("id").eq("id", accountId).maybeSingle();
  return data ? { error: null } : { error: "Conta não encontrada." };
}

export async function openTagManager(accountId: string): Promise<{ tags: CrmTag[]; error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return { tags: [], error: owns.error };
  try {
    const tags = await ensureTagCatalog(createAdminClient(), accountId);
    return { tags, error: null };
  } catch (e) {
    return { tags: [], error: e instanceof Error ? e.message : "Não foi possível abrir o catálogo de tags." };
  }
}

export async function createTag(
  accountId: string,
  name: string,
  color: TagColor
): Promise<{ tag: CrmTag | null; error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return { tag: null, error: owns.error };
  const result = await createTagInCatalog(createAdminClient(), accountId, name, color);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function renameTag(
  accountId: string,
  tagId: string,
  oldName: string,
  newName: string
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  const result = await renameTagInCatalog(createAdminClient(), accountId, tagId, oldName, newName);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function updateTagColor(
  accountId: string,
  tagId: string,
  color: TagColor
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  const result = await updateTagColorInCatalog(createAdminClient(), accountId, tagId, color);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function deleteTag(
  accountId: string,
  tagId: string,
  name: string
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  const result = await deleteTagFromCatalog(createAdminClient(), accountId, tagId, name);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function getTagWorkflowUsage(accountId: string, tagName: string): Promise<TagWorkflowUsage> {
  const supabase = createClient();
  return queryTagWorkflowUsage(supabase, accountId, tagName);
}

export async function applyTagToLead(
  accountId: string,
  senderId: string,
  username: string | null,
  tagName: string,
  action: "add" | "remove"
): Promise<{ error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  try {
    await setContactTag(createAdminClient(), accountId, senderId, username, tagName, action);
    revalidatePath(INBOX_PATH);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível aplicar a tag." };
  }
}

export interface BulkTagTarget {
  accountId: string;
  senderId: string;
  username: string | null;
}

/** Aplica a tag em vários leads de uma vez (seleção múltipla da lista do Inbox). */
export async function applyTagToLeadsBulk(
  targets: readonly BulkTagTarget[],
  tagName: string
): Promise<{ error: string | null; applied: number }> {
  const accountIds = Array.from(new Set(targets.map((t) => t.accountId)));
  for (const accountId of accountIds) {
    const owns = await assertOwnsAccount(accountId);
    if (owns.error) return { error: owns.error, applied: 0 };
  }

  const admin = createAdminClient();
  let applied = 0;
  for (const target of targets) {
    try {
      await setContactTag(admin, target.accountId, target.senderId, target.username, tagName, "add");
      applied += 1;
    } catch {
      // Segue para os demais leads da seleção; um erro isolado não cancela o resto.
    }
  }
  revalidatePath(INBOX_PATH);
  return { error: applied === targets.length ? null : "Alguns leads não puderam ser marcados.", applied };
}
