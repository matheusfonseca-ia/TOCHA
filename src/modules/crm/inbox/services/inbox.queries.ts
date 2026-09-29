import type { createClient } from "@/lib/supabase/server";
import type { SequenceRunStatus } from "@/types/sequence";

import {
  attachTagsToConversations,
  listSenderIdsWithTag,
  listTagCatalog,
} from "../../tags/services/tags.queries";
import type { MessageRow } from "../../shared/types/message";
import type {
  ContactPanelData,
  CrmNote,
  ContactPipelineSection,
  InboxConversation,
  InboxFilters,
  InboxThread,
  QuickReply,
} from "../../shared/types/conversation";

/**
 * Leituras do Inbox, sempre com o client do usuário (RLS garante que ele só
 * vê as próprias contas). Só servidor: Server Components e Server Actions.
 */

type UserClient = ReturnType<typeof createClient>;

const LIST_LIMIT = 60;
const THREAD_LIMIT = 100;
const ACTIVE_RUN_STATUSES: SequenceRunStatus[] = ["running", "waiting_reply", "waiting_postback", "waiting_delay"];

const CONVERSATION_COLUMNS =
  "id, account_id, ig_sender_id, ig_sender_username, last_message_at, last_message_text, last_message_kind, last_message_direction, last_inbound_at, unread_count, contact_seen_at, automation_paused_until, human_takeover_at, status, created_at, ig_profile_pic_url, ig_profile_name, ig_follower_count, ig_follows_business, ig_is_verified, ig_profile_fetched_at, ig_accounts(ig_username)";

type ConversationRow = Omit<InboxConversation, "account_username"> & {
  ig_accounts: { ig_username: string } | null;
};

function toInboxConversation(row: ConversationRow): InboxConversation {
  const { ig_accounts, ...rest } = row;
  return { ...rest, unread_count: rest.unread_count ?? 0, account_username: ig_accounts?.ig_username ?? null };
}

/** Busca livre sem quebrar o filtro `or` do PostgREST (vírgula, parênteses, curinga). */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
}

export async function listConversations(
  supabase: UserClient,
  filters: InboxFilters
): Promise<{ conversations: InboxConversation[]; error: string | null }> {
  let query = supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(LIST_LIMIT);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.status === "unread") query = query.gt("unread_count", 0);
  else if (filters.status === "done") query = query.eq("status", "done");
  else query = query.eq("status", "open");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.or(`ig_sender_username.ilike.%${q}%,last_message_text.ilike.%${q}%`);
  if (filters.tag) {
    const senderIds = await listSenderIdsWithTag(supabase, filters.accountId, filters.tag);
    // Sem ninguém com a tag: devolve lista vazia sem quebrar o `.in()` (array vazio dá erro no PostgREST).
    if (senderIds.length === 0) return { conversations: [], error: null };
    query = query.in("ig_sender_id", senderIds);
  }

  const { data, error } = await query;
  if (error) return { conversations: [], error: error.message };
  const conversations = ((data ?? []) as unknown as ConversationRow[]).map(toInboxConversation);

  const tagsByLead = await attachTagsToConversations(supabase, conversations);
  for (const c of conversations) {
    c.tags = tagsByLead.get(`${c.account_id}:${c.ig_sender_id}`);
  }

  return { conversations, error: null };
}

/**
 * Etapa atual do lead no funil padrão, pra seção "Funil" da ficha (Fase 6).
 * Sem funil padrão ainda, ou conversa sem lead aberto: `undefined` (a ficha
 * mostra "Ainda não entrou no funil").
 */
async function loadPipelineSection(
  supabase: UserClient,
  accountId: string,
  conversationId: string
): Promise<ContactPipelineSection | undefined> {
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("account_id", accountId)
    .eq("is_default", true)
    .maybeSingle<{ id: string }>();
  if (!pipeline) return undefined;

  const [{ data: lead }, { data: stages }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, stage_id")
      .eq("pipeline_id", pipeline.id)
      .eq("conversation_id", conversationId)
      .is("closed_at", null)
      .maybeSingle<{ id: string; stage_id: string }>(),
    supabase.from("pipeline_stages").select("id, name").eq("pipeline_id", pipeline.id).order("position"),
  ]);
  if (!lead) return undefined;

  return { leadId: lead.id, currentStageId: lead.stage_id, stages: (stages ?? []) as { id: string; name: string }[] };
}

export async function getThread(supabase: UserClient, conversationId: string): Promise<InboxThread | null> {
  const { data: row } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle();
  if (!row) return null;
  const conversation = toInboxConversation(row as unknown as ConversationRow);

  const [messagesRes, contactRes, runsRes, tagCatalog, notesRes, quickRepliesRes, pipelineSection] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(THREAD_LIMIT + 1),
    supabase
      .from("contacts")
      .select("fields, tags")
      .eq("account_id", conversation.account_id)
      .eq("ig_sender_id", conversation.ig_sender_id)
      .maybeSingle<{ fields: Record<string, unknown> | null; tags: string[] | null }>(),
    supabase
      .from("sequence_runs")
      .select("id, status, updated_at, sequences(name)")
      .eq("account_id", conversation.account_id)
      .eq("ig_sender_id", conversation.ig_sender_id)
      .in("status", ACTIVE_RUN_STATUSES)
      .order("updated_at", { ascending: false }),
    listTagCatalog(supabase, conversation.account_id),
    supabase
      .from("crm_notes")
      .select("*")
      .eq("account_id", conversation.account_id)
      .eq("ig_sender_id", conversation.ig_sender_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("quick_replies")
      .select("*")
      .eq("account_id", conversation.account_id)
      .order("title", { ascending: true }),
    loadPipelineSection(supabase, conversation.account_id, conversationId),
  ]);

  const rows = (messagesRes.data ?? []) as MessageRow[];
  const panel: ContactPanelData = {
    fields: contactRes.data?.fields ?? {},
    tags: contactRes.data?.tags ?? [],
    tagCatalog,
    runs: ((runsRes.data ?? []) as unknown as {
      id: string;
      status: SequenceRunStatus;
      updated_at: string;
      sequences: { name: string } | null;
    }[]).map((r) => ({
      id: r.id,
      status: r.status,
      updatedAt: r.updated_at,
      sequenceName: r.sequences?.name ?? "Workflow removido",
    })),
    pipeline: pipelineSection,
  };

  return {
    conversation,
    messages: rows.slice(0, THREAD_LIMIT).reverse(),
    hasOlder: rows.length > THREAD_LIMIT,
    panel,
    notes: (notesRes.data ?? []) as CrmNote[],
    quickReplies: (quickRepliesRes.data ?? []) as QuickReply[],
  };
}

/** Total de não lidas do usuário (badge do menu). Sem a migration 0009, zero. */
export async function getUnreadTotal(supabase: UserClient): Promise<number> {
  const { data, error } = await supabase.from("conversations").select("unread_count").gt("unread_count", 0);
  if (error) return 0;
  return ((data ?? []) as { unread_count: number }[]).reduce((sum, r) => sum + (r.unread_count ?? 0), 0);
}
