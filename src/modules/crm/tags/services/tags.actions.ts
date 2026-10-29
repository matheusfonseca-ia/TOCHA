"use server";

import { revalidatePath } from "next/cache";

import { ownedAccountId } from "@/lib/auth/ownership";
import { activeUserId } from "@/lib/auth/require-access";
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
import { isTagColor } from "../utils/palette";
import { getTagWorkflowUsage as queryTagWorkflowUsage } from "./tags.queries";

/**
 * Server actions do catálogo de tags. Sempre no mesmo padrão do módulo:
 * confere a posse da conta com o client do usuário (RLS) e escreve com
 * `createAdminClient` (service role).
 */

/** Seleção múltipla do Inbox: no máximo a lista carregada (60) com folga. */
const MAX_BULK_TARGETS = 100;
const MAX_ID = 64;

/** Acesso ativo (bloqueio/assinatura) + posse da conta pelo RLS. */
async function assertOwnsAccount(accountId: string): Promise<{ error: string | null }> {
  if (!(await activeUserId())) return { error: "Sua assinatura não está ativa. Acesse Minha assinatura para reativar." };
  if (typeof accountId !== "string" || !accountId) return { error: "Conta não encontrada." };
  return (await ownedAccountId(accountId)) ? { error: null } : { error: "Conta não encontrada." };
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export async function openTagManager(accountId: string): Promise<{ tags: CrmTag[]; error: string | null }> {
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return { tags: [], error: owns.error };
  try {
    const tags = await ensureTagCatalog(createAdminClient(), accountId);
    return { tags, error: null };
  } catch (e) {
    console.error("[crm] falha ao abrir o catálogo de tags:", e instanceof Error ? e.message : e);
    return { tags: [], error: "Não foi possível abrir o catálogo de tags." };
  }
}

export async function createTag(
  accountId: string,
  name: string,
  color: TagColor
): Promise<{ tag: CrmTag | null; error: string | null }> {
  if (!isTagColor(color)) return { tag: null, error: "Cor inválida." };
  if (typeof name !== "string") return { tag: null, error: "Escreva um nome para a tag." };
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
  if (typeof oldName !== "string" || typeof newName !== "string") return { error: "Escreva um nome para a tag." };
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
  if (!isTagColor(color)) return { error: "Cor inválida." };
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
  if (typeof name !== "string") return { error: "Tag não encontrada." };
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  const result = await deleteTagFromCatalog(createAdminClient(), accountId, tagId, name);
  if (!result.error) revalidatePath(INBOX_PATH);
  return result;
}

export async function getTagWorkflowUsage(accountId: string, tagName: string): Promise<TagWorkflowUsage> {
  if (!(await activeUserId())) return { count: 0, sequenceNames: [] };
  const supabase = await createClient();
  return queryTagWorkflowUsage(supabase, accountId, tagName);
}

export async function applyTagToLead(
  accountId: string,
  senderId: string,
  username: string | null,
  tagName: string,
  action: "add" | "remove"
): Promise<{ error: string | null }> {
  if (action !== "add" && action !== "remove") return { error: "Ação inválida." };
  if (!isText(senderId, MAX_ID) || typeof tagName !== "string") return { error: "Lead não encontrado." };
  const owns = await assertOwnsAccount(accountId);
  if (owns.error) return owns;
  try {
    await setContactTag(createAdminClient(), accountId, senderId, username, tagName, action);
    revalidatePath(INBOX_PATH);
    return { error: null };
  } catch (e) {
    console.error("[crm] falha ao aplicar tag:", e instanceof Error ? e.message : e);
    return { error: "Não foi possível aplicar a tag." };
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
  if (!Array.isArray(targets) || targets.length === 0) return { error: "Selecione ao menos um lead.", applied: 0 };
  if (targets.length > MAX_BULK_TARGETS) return { error: `Selecione no máximo ${MAX_BULK_TARGETS} leads por vez.`, applied: 0 };
  if (typeof tagName !== "string") return { error: "Escreva um nome para a tag.", applied: 0 };
  if (targets.some((t) => !t || !isText(t.accountId, MAX_ID) || !isText(t.senderId, MAX_ID))) {
    return { error: "Seleção inválida.", applied: 0 };
  }
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
