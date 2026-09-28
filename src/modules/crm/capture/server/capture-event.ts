import { createAdminClient } from "@/lib/supabase/admin";

import { parseMessagingEvent, type IncomingMessagingEvent } from "../utils/parse-event";
import { findAccountId, markSeen, recordIncoming, recordSignal } from "./record";

/**
 * Entrada do CRM no webhook: grava a mensagem, o eco ou o sinal (reação,
 * edição, apagada, visto) de um evento `messaging[]`.
 *
 * Nunca lança: o webhook chama isto em paralelo com as automações, e uma
 * falha no CRM não pode atrasar nem derrubar uma resposta automática.
 */
export async function captureMessagingEvent(
  igBusinessId: string,
  event: IncomingMessagingEvent
): Promise<void> {
  try {
    // No eco quem envia é a conta; sem entry.id, deduz pelo lado certo.
    const businessId =
      igBusinessId || (event.message?.is_echo ? event.sender?.id : event.recipient?.id) || "";
    const action = parseMessagingEvent(businessId, event);
    if (!action) return;

    const admin = createAdminClient();
    const accountId = await findAccountId(admin, businessId);
    if (!accountId) return;

    switch (action.type) {
      case "message":
        await recordIncoming(admin, accountId, action.message, action.echo ? "instagram_app" : "contact");
        return;
      case "signal":
        await recordSignal(admin, accountId, action.mid, action.signal, action.at);
        return;
      case "seen":
        await markSeen(admin, accountId, action.leadId, action.at);
        return;
    }
  } catch (err) {
    console.error("[crm] falha ao capturar evento:", err instanceof Error ? err.message : err);
  }
}
