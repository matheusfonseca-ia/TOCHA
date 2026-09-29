import type { createClient } from "@/lib/supabase/server";
import type { InboxConversation } from "../../shared/types/conversation";
import type { CrmTag } from "../types";
import { findTagWorkflowUsage, type TagWorkflowUsage } from "../utils/tag-usage";

/**
 * Leituras do catálogo de tags e do uso nos workflows, sempre com o client do
 * usuário (RLS garante que ele só vê as próprias contas). Só servidor.
 */

type UserClient = ReturnType<typeof createClient>;

export async function listTagCatalog(supabase: UserClient, accountId: string): Promise<CrmTag[]> {
  const { data, error } = await supabase
    .from("crm_tags")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) return [];
  return (data ?? []) as CrmTag[];
}

/**
 * Tags de todas as contas do usuário, mescladas por nome (sem diferenciar
 * maiúscula/acento) para o filtro da lista do Inbox quando "Todas as contas"
 * está selecionado.
 */
export async function listAllTagNames(supabase: UserClient): Promise<CrmTag[]> {
  const { data, error } = await supabase.from("crm_tags").select("*").order("name");
  if (error) return [];
  const seen = new Map<string, CrmTag>();
  for (const tag of (data ?? []) as CrmTag[]) {
    const key = tag.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  return Array.from(seen.values());
}

export async function getTagWorkflowUsage(
  supabase: UserClient,
  accountId: string,
  tagName: string
): Promise<TagWorkflowUsage> {
  const { data } = await supabase
    .from("sequences")
    .select("id, name, graph")
    .eq("account_id", accountId);
  return findTagWorkflowUsage((data ?? []) as { id: string; name: string; graph: any }[], tagName);
}

/** Nome + conta de todas as tags do usuário, para o autocomplete dos nós de dados do editor de workflow. */
export async function listTagOptionsForEditor(
  supabase: UserClient
): Promise<{ account_id: string; name: string }[]> {
  const { data, error } = await supabase.from("crm_tags").select("account_id, name");
  if (error) return [];
  return (data ?? []) as { account_id: string; name: string }[];
}

/** IDs de remetente (ig_sender_id) dos contatos com a tag, para filtrar a lista do Inbox. */
export async function listSenderIdsWithTag(
  supabase: UserClient,
  accountId: string,
  tagName: string
): Promise<string[]> {
  let query = supabase.from("contacts").select("ig_sender_id").contains("tags", [tagName]);
  if (accountId) query = query.eq("account_id", accountId);
  const { data } = await query;
  return ((data ?? []) as { ig_sender_id: string }[]).map((c) => c.ig_sender_id);
}

/**
 * Tags (nome + cor) de cada conversa listada, buscadas por
 * (account_id, ig_sender_id) numa consulta extra. No máximo 2 por conversa
 * (o card da lista só tem espaço para isso); a ficha mostra todas.
 */
export async function attachTagsToConversations(
  supabase: UserClient,
  conversations: readonly Pick<InboxConversation, "account_id" | "ig_sender_id">[]
): Promise<Map<string, { name: string; color: CrmTag["color"] }[]>> {
  const map = new Map<string, { name: string; color: CrmTag["color"] }[]>();
  if (conversations.length === 0) return map;

  const senderIds = Array.from(new Set(conversations.map((c) => c.ig_sender_id)));
  const accountIds = Array.from(new Set(conversations.map((c) => c.account_id)));

  const [contactsRes, tagsRes] = await Promise.all([
    supabase.from("contacts").select("account_id, ig_sender_id, tags").in("ig_sender_id", senderIds),
    supabase.from("crm_tags").select("account_id, name, color").in("account_id", accountIds),
  ]);

  const colorByName = new Map<string, CrmTag["color"]>();
  for (const t of (tagsRes.data ?? []) as { account_id: string; name: string; color: CrmTag["color"] }[]) {
    colorByName.set(`${t.account_id}:${t.name.toLowerCase()}`, t.color);
  }

  for (const c of (contactsRes.data ?? []) as { account_id: string; ig_sender_id: string; tags: string[] | null }[]) {
    const tags = (c.tags ?? []).slice(0, 2).map((name) => ({
      name,
      color: colorByName.get(`${c.account_id}:${name.toLowerCase()}`) ?? "green",
    }));
    if (tags.length > 0) map.set(`${c.account_id}:${c.ig_sender_id}`, tags);
  }

  return map;
}
