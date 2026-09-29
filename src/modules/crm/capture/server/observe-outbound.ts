import { observeSends } from "@/lib/meta/graph";
import { createAdminClient } from "@/lib/supabase/admin";

import type { MessageSource } from "../../shared/types/message";
import { parseSentMessage } from "../utils/parse-sent";
import { findAccountId, recordOutbound } from "./record";

export interface OutboundContext {
  /** Conta conhecida (runtime de workflow, painel). */
  accountId?: string;
  /** Ou o ig_user_id do webhook, resolvido no 1º envio. */
  igUserId?: string;
  source: MessageSource;
  /** Atendente que respondeu pelo painel. */
  sentBy?: string | null;
}

/**
 * Roda `fn` gravando no CRM toda mensagem que ela enviar pela Graph API, com a
 * origem certa. Contextos aninhados: o mais interno vence (um workflow
 * iniciado por uma regra grava como `workflow`). Falha na gravação nunca
 * derruba o envio.
 */
export function observeOutbound<T>(ctx: OutboundContext, fn: () => Promise<T>): Promise<T> {
  let accountId = ctx.accountId ?? null;
  return observeSends(async (sent) => {
    try {
      const draft = parseSentMessage(sent.body, sent.response);
      if (!draft) return;
      const admin = createAdminClient();
      accountId ??= ctx.igUserId ? await findAccountId(admin, ctx.igUserId) : null;
      if (!accountId) return;
      await recordOutbound(admin, accountId, draft, ctx.source, ctx.sentBy ?? null);
    } catch (err) {
      console.error("[crm] falha ao gravar envio:", err instanceof Error ? err.message : err);
    }
  }, fn);
}
