import { fetchAndStoreUsername } from "@/lib/contacts/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollLeadFromCapture } from "@/modules/crm/pipeline/server/enroll-lead";

import { parseMessagingEvent, type IncomingMessagingEvent } from "../utils/parse-event";
import {
  ensureConversation,
  findAccount,
  leadNeedsUsername,
  markSeen,
  recordIncoming,
  recordSignal,
} from "./record";

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
    const account = await findAccount(admin, businessId);
    if (!account) return;

    switch (action.type) {
      case "message": {
        const { message } = action;
        await recordIncoming(admin, account.id, message, action.echo ? "instagram_app" : "contact");
        // O @ do lead aparece na lista do Inbox. Buscado uma vez, na mensagem
        // dele: é quando a Meta garante o consentimento para ler o perfil.
        if (message.direction === "inbound" && (await leadNeedsUsername(admin, account.id, message.leadId))) {
          await fetchAndStoreUsername(admin, account, message.leadId);
        }
        // Entrada automática no funil padrão (D2): só para mensagem do lead
        // (nunca eco). `moveLead` é idempotente: reentrega do webhook ou
        // corrida com "Trazer conversas existentes" só bate no 23505.
        if (message.direction === "inbound") {
          const conversationId = await ensureConversation(admin, account.id, message.leadId);
          await enrollLeadFromCapture(admin, account.id, conversationId, message.leadId);
        }
        return;
      }
      case "signal":
        await recordSignal(admin, account.id, action.mid, action.signal, action.at);
        return;
      case "seen":
        await markSeen(admin, account.id, action.leadId, action.at);
        return;
    }
  } catch (err) {
    console.error("[crm] falha ao capturar evento:", err instanceof Error ? err.message : err);
  }
}
