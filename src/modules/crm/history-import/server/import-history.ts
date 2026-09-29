import { getConversationMessages, listConversationsPage } from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

import { recordIncoming } from "../../capture/server/record";
import { findLeadParticipant, mapImportedMessage } from "../utils/map-message";

/**
 * Importação do histórico de DMs (Conversations API). A Meta só libera as 20
 * mensagens mais recentes por conversa e não pagina além disso (Fase 0,
 * 28/09/2026): isto não é uma limitação deste código, é o teto da API.
 *
 * Processa em lotes: uma página de conversas por chamada, porque cada
 * conversa da página ainda gasta 1 requisição extra (as mensagens dela) e o
 * Worker tem tempo de execução limitado. A UI chama de novo com o cursor
 * devolvido até `done: true`.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const CONVERSATIONS_PER_BATCH = 5;

export interface ImportBatchResult {
  /** Cursor para a próxima chamada; null quando `done`. */
  nextCursor: string | null;
  done: boolean;
  conversationsProcessed: number;
  messagesImported: number;
}

/** `last_inbound_at` só avança: um lote reprocessado não pode "voltar" a janela de 24h. */
async function advanceLastInboundAt(
  admin: AdminClient,
  accountId: string,
  leadId: string,
  at: string
): Promise<void> {
  const conversation = () =>
    admin
      .from("conversations")
      .update({ last_inbound_at: at })
      .eq("account_id", accountId)
      .eq("ig_sender_id", leadId);
  await conversation().is("last_inbound_at", null);
  await conversation().lt("last_inbound_at", at);
}

export async function importHistoryBatch(
  admin: AdminClient,
  account: IgAccount,
  cursor: string | null
): Promise<ImportBatchResult> {
  const token = await getFreshToken(admin, account);
  const { conversations, nextAfter } = await listConversationsPage(
    token,
    cursor ?? undefined,
    CONVERSATIONS_PER_BATCH
  );

  let messagesImported = 0;

  for (const conv of conversations) {
    const leadId = findLeadParticipant(conv.participants?.data ?? [], account.ig_user_id);
    if (!leadId) continue;

    const rawMessages = await getConversationMessages(token, conv.id);
    let latestInboundAt: string | null = null;

    for (const raw of rawMessages) {
      const draft = mapImportedMessage(raw, account.ig_user_id, leadId);
      // Dedupe pelo mid (unique account_id+mid): reentrega ou 2ª importação
      // não duplica, `recordIncoming` já ignora a violação em silêncio.
      await recordIncoming(admin, account.id, draft, "import");
      messagesImported++;
      if (draft.direction === "inbound" && (!latestInboundAt || draft.createdAt > latestInboundAt)) {
        latestInboundAt = draft.createdAt;
      }
    }

    if (latestInboundAt) await advanceLastInboundAt(admin, account.id, leadId, latestInboundAt);
  }

  return {
    nextCursor: nextAfter,
    done: nextAfter === null,
    conversationsProcessed: conversations.length,
    messagesImported,
  };
}
