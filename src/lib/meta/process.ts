import { decryptToken } from "@/lib/crypto";
import { fireN8nWebhook } from "@/lib/n8n";
import { clampDelay, findMatchingRule } from "@/lib/rules/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, InteractionStatus, Rule } from "@/types/database";
import {
  GraphApiError,
  sendButtonsMessage,
  sendImageMessage,
  sendTextMessage,
} from "./graph";

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface WebhookEntry {
  id?: string;
  time?: number;
  messaging?: MessagingEvent[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * Pipeline por mensagem recebida:
 *  1. idempotência (mid)          → Meta reenvia webhooks sem ack
 *  2. localizar conta ativa       → entry.id = IG business account id
 *  3. atualizar conversa          → base da janela de 24h e métricas
 *  4. matching de regras          → sem regra: não responde, apenas loga
 *  5. anti-duplicidade            → mesma regra nunca 2x para o mesmo usuário
 *  6. janela de 24h               → mensagens atrasadas não são respondidas
 *  7. delay 2–5s + envio          → simula digitação humana
 *  8. log + webhook n8n           → toda mensagem processada gera evento
 */
export async function processWebhookPayload(
  payload: MetaWebhookPayload
): Promise<void> {
  if (payload.object !== "instagram") return;

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      await processMessagingEvent(entry.id ?? "", event);
    }
  }
}

async function processMessagingEvent(
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  const message = event.message;
  const senderId = event.sender?.id;

  // Ignora echoes (mensagens da própria conta) e eventos sem texto
  if (!message?.mid || !senderId || message.is_echo || !message.text) return;

  const admin = createAdminClient();

  // 1. Idempotência: insert falha em mid repetido → evento já processado
  const { error: dedupError } = await admin
    .from("processed_events")
    .insert({ mid: message.mid });
  if (dedupError) return;

  // 2. Conta ativa que recebeu a DM
  const recipientId = igBusinessId || event.recipient?.id || "";
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", recipientId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  if (!account) return;

  const startedAt = Date.now();

  // 3. Atualiza a conversa (janela de 24h conta a partir da última inbound)
  await admin.from("conversations").upsert(
    {
      account_id: account.id,
      ig_sender_id: senderId,
      last_inbound_at: new Date().toISOString(),
    },
    { onConflict: "account_id,ig_sender_id" }
  );

  // 4. Matching de regras
  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", account.id)
    .eq("is_active", true);

  const rule = findMatchingRule(message.text, (rules ?? []) as Rule[]);

  let status: InteractionStatus;
  let errorDetail: string | null = null;

  if (!rule) {
    status = "no_match";
  } else {
    const result = await applyRule(admin, account, rule, senderId, event);
    status = result.status;
    errorDetail = result.errorDetail ?? null;
  }

  // 8a. Log da interação
  await admin.from("interactions").insert({
    account_id: account.id,
    ig_sender_id: senderId,
    message_text: message.text.slice(0, 2000),
    matched_rule_id: rule?.id ?? null,
    matched_keyword: rule?.keyword ?? null,
    status,
    reply_type: rule?.reply_type ?? null,
    error_detail: errorDetail,
    latency_ms: Date.now() - startedAt,
  });

  // 8b. Webhook n8n do dono da conta
  const { data: settings } = await admin
    .from("user_settings")
    .select("n8n_webhook_url, n8n_enabled")
    .eq("user_id", account.user_id)
    .maybeSingle();

  if (settings?.n8n_enabled && settings.n8n_webhook_url) {
    await fireN8nWebhook(settings.n8n_webhook_url, {
      event: "message_processed",
      timestamp: new Date().toISOString(),
      account: {
        ig_user_id: account.ig_user_id,
        ig_username: account.ig_username,
      },
      sender_id: senderId,
      message_text: message.text,
      result: {
        status,
        matched_keyword: rule?.keyword ?? null,
        rule_id: rule?.id ?? null,
        reply_type: rule ? rule.reply_type : null,
      },
    });
  }
}

async function applyRule(
  admin: AdminClient,
  account: IgAccount,
  rule: Rule,
  senderId: string,
  event: MessagingEvent
): Promise<{ status: InteractionStatus; errorDetail?: string }> {
  // 5. Anti-duplicidade: mesma regra nunca dispara 2x para o mesmo usuário
  const { data: alreadyTriggered } = await admin
    .from("rule_triggers")
    .select("rule_id")
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle();
  if (alreadyTriggered) return { status: "duplicate_skip" };

  // 6. Janela de 24h: se o evento chegou atrasado (retry do Meta), não responde
  if (event.timestamp && Date.now() - event.timestamp > WINDOW_24H_MS) {
    return { status: "window_expired" };
  }

  // 7. Delay humanizado (regra de negócio: 2–5s)
  await sleep(clampDelay(rule.delay_seconds) * 1000);

  try {
    const token = decryptToken(account.access_token_enc);

    if (rule.reply_type === "text") {
      await sendTextMessage(token, senderId, rule.reply_text ?? "");
    } else if (rule.reply_type === "image") {
      await sendImageMessage(token, senderId, rule.reply_image_url ?? "");
    } else {
      await sendButtonsMessage(
        token,
        senderId,
        rule.reply_text ?? "",
        rule.reply_buttons ?? []
      );
    }
  } catch (err) {
    // Token inválido/expirado → marca a conta para reconexão
    if (err instanceof GraphApiError && err.code === 190) {
      await admin
        .from("ig_accounts")
        .update({ status: "expired" })
        .eq("id", account.id);
    }
    return {
      status: "error",
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }

  // Marca o disparo; ignoreDuplicates cobre corrida entre webhooks concorrentes
  await admin.from("rule_triggers").upsert(
    { rule_id: rule.id, account_id: account.id, ig_sender_id: senderId },
    { onConflict: "rule_id,ig_sender_id", ignoreDuplicates: true }
  );

  return { status: "replied" };
}
