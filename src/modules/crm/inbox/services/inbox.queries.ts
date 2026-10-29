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

type UserClient = Awaited<ReturnType<typeof createClient>>;

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

/**
 * Termo da busca livre pronto para ir entre aspas no filtro `or` do
 * PostgREST: tira o que quebra o filtro ou vira curinga (`%`, `*`, aspas,
 * barra invertida, vírgula, parênteses) e escapa o `_` (curinga de um
 * caractere no ILIKE), que continua buscável (`joao_silva`). Dentro das
 * aspas o PostgREST lê `\\` como `\`, e o ILIKE lê `\_` como `_` literal.
 */
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[,()%*\\"]/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/_/g, "\\\\_");
}

/** Filtro `or` da busca livre (valores entre aspas: `.` e `:` no termo não quebram). */
export function searchFilter(q: string): string | null {
  const term = sanitizeSearch(q);
  if (!term) return null;
  return `ig_sender_username.ilike."%${term}%",last_message_text.ilike."%${term}%"`;
}

// Ids por consulta no filtro por tag: milhares de ids num só `in()` estouram a URL.
const SENDER_CHUNK = 150;

/** Mesma ordem da consulta (mais recente primeiro, nulos no fim), para juntar os blocos. */
function byRecent(a: InboxConversation, b: InboxConversation): number {
  const key = (v: string | null) => (v ? Date.parse(v) : Number.NEGATIVE_INFINITY);
  const diff = (x: number, y: number) => (x === y ? 0 : y > x ? 1 : -1);
  return diff(key(a.last_message_at), key(b.last_message_at)) || diff(key(a.last_inbound_at), key(b.last_inbound_at));
}

export async function listConversations(
  supabase: UserClient,
  filters: InboxFilters
): Promise<{ conversations: InboxConversation[]; error: string | null }> {
  const build = () => {
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
    const search = searchFilter(filters.q);
    if (search) query = query.or(search);
    return query;
  };

  let rows: ConversationRow[];
  let failure: string | null = null;
  if (filters.tag) {
    const senderIds = await listSenderIdsWithTag(supabase, filters.accountId, filters.tag);
    // Sem ninguém com a tag: devolve lista vazia sem quebrar o `.in()` (array vazio dá erro no PostgREST).
    if (senderIds.length === 0) return { conversations: [], error: null };
    // Em blocos (URL curta), cada um já ordenado e limitado; junta e corta de novo abaixo.
    const chunks: string[][] = [];
    for (let i = 0; i < senderIds.length; i += SENDER_CHUNK) chunks.push(senderIds.slice(i, i + SENDER_CHUNK));
    const results = await Promise.all(chunks.map((ids) => build().in("ig_sender_id", ids)));
    failure = results.find((r) => r.error)?.error?.message ?? null;
    rows = results.flatMap((r) => (r.data ?? []) as unknown as ConversationRow[]);
  } else {
    const { data, error } = await build();
    failure = error?.message ?? null;
    rows = (data ?? []) as unknown as ConversationRow[];
  }
  if (failure) {
    console.error("[crm] falha ao listar conversas:", failure);
    return { conversations: [], error: "Não foi possível carregar as conversas." };
  }
  const conversations = rows.map(toInboxConversation).sort(byRecent).slice(0, LIST_LIMIT);

  const tagsByLead = await attachTagsToConversations(supabase, conversations);
  for (const c of conversations) {
    c.tags = tagsByLead.get(`${c.account_id}:${c.ig_sender_id}`);
  }

  return { conversations, error: null };
}

/**
 * Etapa atual do lead no funil padrão, pra seção "Funil" da ficha (Fase 6).
 * Sem funil padrão ainda, ou conversa sem lead no funil: `undefined` (a ficha
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
      // Lead ganho/perdido também é o lead da conversa (mesma regra do moveLead).
      .order("created_at", { ascending: false })
      .limit(1)
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

/** Conversas lidas para o badge: acima de 99 a sidebar só mostra "99+". */
const UNREAD_SCAN = 100;

/**
 * Total de não lidas do usuário (badge do menu). Lê no máximo 100 conversas
 * com não lidas: cada uma tem ao menos 1, então daí em diante o total já
 * passou do teto que a sidebar mostra e somar o resto (até o corte de 1000
 * linhas do PostgREST) seria só desperdício. Sem a migration 0009, zero.
 */
export async function getUnreadTotal(supabase: UserClient): Promise<number> {
  const { data, error } = await supabase
    .from("conversations")
    .select("unread_count")
    .gt("unread_count", 0)
    .limit(UNREAD_SCAN);
  if (error) return 0;
  return ((data ?? []) as { unread_count: number }[]).reduce((sum, r) => sum + (r.unread_count ?? 0), 0);
}
