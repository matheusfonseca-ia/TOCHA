import type { createAdminClient } from "@/lib/supabase/admin";

import type {
  MessageDraft,
  MessageSignal,
  MessageSource,
} from "../../shared/types/message";

/**
 * Gravação das mensagens do CRM com a service role. Tudo aqui é chamado em
 * modo best effort por quem captura (webhook e envios): quem chama engole o
 * erro, o que garante que o CRM nunca atrapalha uma automação.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const PG_UNIQUE_VIOLATION = "23505";
// Sinal órfão (a mensagem nunca chegou) não fica para sempre na fila.
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function findAccountId(admin: AdminClient, igUserId: string): Promise<string | null> {
  if (!igUserId) return null;
  const { data } = await admin
    .from("ig_accounts")
    .select("id")
    .eq("ig_user_id", igUserId)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/**
 * Conversa da pessoa, criada se ainda não existe. Criada aqui ela nasce sem
 * `last_inbound_at` (janela fechada): quem abre a janela é o webhook de uma
 * mensagem recebida (`touchConversation`), nunca um envio.
 */
export async function ensureConversation(
  admin: AdminClient,
  accountId: string,
  leadId: string
): Promise<string> {
  const { data, error } = await admin
    .from("conversations")
    .upsert({ account_id: accountId, ig_sender_id: leadId }, { onConflict: "account_id,ig_sender_id" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`conversa não criada: ${error?.message ?? "sem linha"}`);
  return data.id;
}

function toRow(
  accountId: string,
  conversationId: string,
  draft: MessageDraft,
  source: MessageSource,
  sentBy: string | null
) {
  return {
    account_id: accountId,
    conversation_id: conversationId,
    ig_sender_id: draft.leadId,
    direction: draft.direction,
    source,
    mid: draft.mid,
    kind: draft.kind,
    text: draft.text,
    attachments: draft.attachments,
    meta: draft.meta,
    reply_to_mid: draft.replyToMid,
    sent_by: sentBy,
    created_at: draft.createdAt,
  };
}

/**
 * Mensagem vinda do webhook (do lead ou eco). Grava uma vez só: reentrega do
 * webhook, ou eco de algo que o Falow já gravou no envio, bate no unique
 * (account_id, mid) e é ignorada, preservando a origem gravada no envio.
 */
export async function recordIncoming(
  admin: AdminClient,
  accountId: string,
  draft: MessageDraft,
  source: MessageSource
): Promise<void> {
  const conversationId = await ensureConversation(admin, accountId, draft.leadId);
  const { error } = await admin
    .from("messages")
    .insert(toRow(accountId, conversationId, draft, source, null));
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return;
    throw new Error(`mensagem não gravada: ${error.message}`);
  }
  if (draft.mid) await applyPendingSignals(admin, accountId, draft.mid);
}

/**
 * Mensagem enviada pelo Falow, gravada no momento do envio com a origem certa.
 * Se o eco chegou antes (gravado como `instagram_app`), o upsert corrige.
 */
export async function recordOutbound(
  admin: AdminClient,
  accountId: string,
  draft: MessageDraft,
  source: MessageSource,
  sentBy: string | null
): Promise<void> {
  const conversationId = await ensureConversation(admin, accountId, draft.leadId);
  const row = toRow(accountId, conversationId, draft, source, sentBy);
  const { error } = draft.mid
    ? await admin.from("messages").upsert(row, { onConflict: "account_id,mid" })
    : await admin.from("messages").insert(row);
  if (error) throw new Error(`envio não gravado: ${error.message}`);
  if (draft.mid) await applyPendingSignals(admin, accountId, draft.mid);
}

/** O que um sinal muda na mensagem. Edição guarda o texto de antes da 1ª. */
export function signalPatch(
  signal: MessageSignal,
  current: { text: string | null; original_text: string | null },
  at: string
): Record<string, unknown> {
  switch (signal.type) {
    case "reaction":
      return { reaction_emoji: signal.emoji };
    case "unreaction":
      return { reaction_emoji: null };
    case "edit":
      return {
        text: signal.text,
        edited_at: at,
        edit_count: signal.editCount,
        original_text: current.original_text ?? current.text,
      };
    case "deleted":
      return { deleted_by_contact_at: at };
  }
}

async function applySignal(
  admin: AdminClient,
  accountId: string,
  mid: string,
  signal: MessageSignal,
  at: string
): Promise<boolean> {
  const { data: message } = await admin
    .from("messages")
    .select("id, text, original_text")
    .eq("account_id", accountId)
    .eq("mid", mid)
    .maybeSingle<{ id: string; text: string | null; original_text: string | null }>();
  if (!message) return false;
  await admin.from("messages").update(signalPatch(signal, message, at)).eq("id", message.id);
  return true;
}

/**
 * Reação, edição ou "apagada". A Meta entrega fora de ordem (na Fase 0 a
 * reação e a edição chegaram antes da mensagem): sem a mensagem, o sinal
 * espera na fila e é aplicado quando ela for gravada.
 */
export async function recordSignal(
  admin: AdminClient,
  accountId: string,
  mid: string,
  signal: MessageSignal,
  at: string
): Promise<void> {
  if (await applySignal(admin, accountId, mid, signal, at)) return;

  const { data: pending } = await admin
    .from("message_signals_pending")
    .insert({ account_id: accountId, mid, type: signal.type, payload: { signal, at } })
    .select("id")
    .single<{ id: string }>();

  // A mensagem pode ter sido gravada entre a checagem e a fila (webhooks em
  // paralelo): confere de novo para o sinal não ficar órfão.
  if (pending && (await applySignal(admin, accountId, mid, signal, at))) {
    await admin.from("message_signals_pending").delete().eq("id", pending.id);
  }

  await admin
    .from("message_signals_pending")
    .delete()
    .eq("account_id", accountId)
    .lt("created_at", new Date(Date.now() - PENDING_TTL_MS).toISOString());
}

async function applyPendingSignals(admin: AdminClient, accountId: string, mid: string): Promise<void> {
  const { data } = await admin
    .from("message_signals_pending")
    .select("id, payload")
    .eq("account_id", accountId)
    .eq("mid", mid)
    .order("created_at");
  const pending = (data ?? []) as { id: string; payload: { signal: MessageSignal; at: string } }[];
  if (!pending.length) return;

  for (const p of pending) await applySignal(admin, accountId, mid, p.payload.signal, p.payload.at);
  await admin
    .from("message_signals_pending")
    .delete()
    .in("id", pending.map((p) => p.id));
}

/** "Visto" do lead: só avança (webhook atrasado não volta o horário). */
export async function markSeen(
  admin: AdminClient,
  accountId: string,
  leadId: string,
  at: string
): Promise<void> {
  const conversation = () =>
    admin
      .from("conversations")
      .update({ contact_seen_at: at })
      .eq("account_id", accountId)
      .eq("ig_sender_id", leadId);
  await conversation().is("contact_seen_at", null);
  await conversation().lt("contact_seen_at", at);
}
