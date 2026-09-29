import { createAdminClient } from "@/lib/supabase/admin";

import { refreshLeadProfile } from "../../lead-profile/server/refresh-profile";
import { parseMessagingEvent, type IncomingMessagingEvent } from "../utils/parse-event";
import { findAccount, leadNeedsProfile, markSeen, recordIncoming, recordSignal } from "./record";

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
        // O @ e a foto do lead aparecem no Inbox. Buscados uma vez, na 1ª
        // mensagem dele: é quando a Meta garante o consentimento para ler o
        // perfil. Só uma vez: `ig_profile_fetched_at` fica gravado até na falha.
        if (message.direction === "inbound" && (await leadNeedsProfile(admin, account.id, message.leadId))) {
          await refreshLeadProfile(admin, account, message.leadId);
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
