import {
  clampDelay,
  findMatchingCommentRule,
  findMatchingRule,
} from "@/lib/rules/engine";
import {
  handleSequencePostback,
  handleSequenceReply,
  maybeStartSequence,
  processDueRunsSafe,
  type SequenceOutcome,
} from "@/lib/sequences/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, InteractionStatus, Rule } from "@/types/database";
import {
  GraphApiError,
  replyToComment,
  sendButtonsMessage,
  sendImageMessage,
  sendPrivateReplyWithButton,
  sendTextMessage,
} from "./graph";
import { getFreshToken } from "./token";

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
// Limite da própria Meta para resposta privada a um comentário.
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Prefixo do payload do botão postback da mensagem de boas-vindas —
// carrega o id da regra até o toque no botão (evento messaging_postbacks).
const COMMENT_LINK_PAYLOAD_PREFIX = "instareply:comment_link:";

type AdminClient = ReturnType<typeof createAdminClient>;

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    /** Presente quando o usuário toca numa resposta rápida. */
    quick_reply?: { payload?: string };
  };
  postback?: { mid?: string; title?: string; payload?: string };
}

interface CommentValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
  parent_id?: string;
}

interface WebhookChange {
  field?: string;
  value?: CommentValue;
}

interface WebhookEntry {
  id?: string;
  time?: number;
  messaging?: MessagingEvent[];
  // Comentários chegam assim com o Login do Instagram (Business Login):
  // "field"/"value" direto no entry, sem array "changes".
  field?: string;
  value?: CommentValue;
  // O Login do Facebook usa "changes[]" — aceitamos os dois formatos.
  changes?: WebhookChange[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * Pipeline por evento recebido:
 *  - mensagens diretas (`messaging[].message`) → ver `processMessagingEvent`
 *  - toque no botão da mensagem de boas-vindas (`messaging[].postback`) → `processPostbackEvent`
 *  - comentários (`field`/`value` ou `changes[]` = "comments") → `processCommentEvent`
 * Todos compartilham: idempotência, busca da conta pelo `entry.id`, matching
 * de regras, anti-duplicidade por (regra, usuário) e log em `interactions`.
 */
export async function processWebhookPayload(
  payload: MetaWebhookPayload
): Promise<void> {
  if (payload.object !== "instagram") return;

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      await processMessagingEvent(entry.id ?? "", event);
    }

    if (entry.field === "comments" && entry.value) {
      await processCommentEvent(entry.id ?? "", entry.time, entry.value);
    }
    for (const change of entry.changes ?? []) {
      if (change.field === "comments" && change.value) {
        await processCommentEvent(entry.id ?? "", entry.time, change.value);
      }
    }
  }

  // Tick oportunista: aproveita a invocação para retomar sequências paradas
  // em nós de atraso cujo horário venceu (complementa a rota de cron).
  await processDueRunsSafe();
}

async function processMessagingEvent(
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  if (event.postback) {
    await processPostbackEvent(igBusinessId, event);
    return;
  }

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

  // 4a. Sequência esperando esta pessoa? Continuação tem prioridade sobre
  // regras: quem está no meio de um fluxo não deve ser "sequestrado" por
  // uma regra de palavra-chave (cobre quick replies e o nó "esperar resposta").
  const seqReply = await handleSequenceReply(
    admin,
    account,
    senderId,
    message.quick_reply?.payload
  );
  if (seqReply) {
    await logSequenceInteraction(
      admin,
      account,
      senderId,
      message.text,
      seqReply,
      startedAt
    );
    return;
  }

  // 4b. Matching de regras (só as de gatilho "dm")
  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", account.id)
    .eq("trigger_type", "dm")
    .eq("is_active", true);

  const rule = findMatchingRule(message.text, (rules ?? []) as Rule[]);

  // 4c. Nenhuma regra casou → a mensagem pode ser gatilho de uma sequência
  if (!rule) {
    const seqStart = await maybeStartSequence(
      admin,
      account,
      senderId,
      message.text
    );
    if (seqStart) {
      await logSequenceInteraction(
        admin,
        account,
        senderId,
        message.text,
        seqStart,
        startedAt
      );
      return;
    }
  }

  let status: InteractionStatus;
  let errorDetail: string | null = null;

  if (!rule) {
    status = "no_match";
  } else {
    const result = await applyRule(admin, account, rule, senderId, event);
    status = result.status;
    errorDetail = result.errorDetail ?? null;
  }

  // 8. Log da interação
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
}

/** Log padronizado de um evento tratado por uma sequência. */
async function logSequenceInteraction(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  messageText: string,
  outcome: SequenceOutcome,
  startedAt: number
): Promise<void> {
  await admin.from("interactions").insert({
    account_id: account.id,
    ig_sender_id: senderId,
    message_text: messageText.slice(0, 2000),
    sequence_id: outcome.sequenceId,
    matched_keyword: outcome.sequenceName,
    status: outcome.status,
    reply_type: null,
    error_detail: outcome.errorDetail ?? null,
    latency_ms: Date.now() - startedAt,
  });
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
    const token = await getFreshToken(admin, account);
    await sendRuleReply(token, senderId, rule);
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

/** Envia a 2ª mensagem de uma regra (resposta de DM direta, ou o link após o postback do comentário). */
async function sendRuleReply(
  token: string,
  recipientId: string,
  rule: Rule
): Promise<void> {
  if (rule.reply_type === "text") {
    await sendTextMessage(token, recipientId, rule.reply_text ?? "");
  } else if (rule.reply_type === "image") {
    await sendImageMessage(token, recipientId, rule.reply_image_url ?? "");
  } else {
    await sendButtonsMessage(
      token,
      recipientId,
      rule.reply_text ?? "",
      rule.reply_buttons ?? []
    );
  }
}

/**
 * Toque no botão da mensagem de boas-vindas do fluxo de comentário.
 * A resposta privada já abriu a janela de mensagens com o usuário, então
 * esta 2ª mensagem (o link) sai como DM normal (recipient.id).
 */
async function processPostbackEvent(
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  const senderId = event.sender?.id;
  const mid = event.postback?.mid;
  const payload = event.postback?.payload;
  if (!senderId || !payload) return;

  // Botão de ramificação de uma sequência (nó de botões do canvas)
  if (payload.startsWith("instareply:seq:")) {
    await processSequencePostbackEvent(igBusinessId, senderId, mid, payload);
    return;
  }

  if (!payload.startsWith(COMMENT_LINK_PAYLOAD_PREFIX)) return;

  const admin = createAdminClient();

  if (mid) {
    const { error: dedupError } = await admin
      .from("processed_events")
      .insert({ mid });
    if (dedupError) return;
  }

  const ruleId = payload.slice(COMMENT_LINK_PAYLOAD_PREFIX.length);
  const recipientId = igBusinessId || event.recipient?.id || "";

  const [{ data: account }, { data: rule }] = await Promise.all([
    admin
      .from("ig_accounts")
      .select("*")
      .eq("ig_user_id", recipientId)
      .eq("status", "active")
      .maybeSingle<IgAccount>(),
    admin
      .from("rules")
      .select("*")
      .eq("id", ruleId)
      .eq("trigger_type", "comment")
      .eq("is_active", true)
      .maybeSingle<Rule>(),
  ]);
  // rule.account_id !== account.id nunca deveria acontecer (o payload só é
  // gerado por nós, pra uma regra da própria conta), mas checar explicita é
  // mais barato do que confiar nisso implicitamente.
  if (!account || !rule || rule.account_id !== account.id) return;

  // Trava a entrega do link a 1x por pessoa por regra — via UPDATE atômico
  // condicionado a link_delivered_at IS NULL, cobre tanto um 2º toque no
  // botão quanto uma reentrega do webhook sem "mid" para dedupe acima.
  const { data: locked } = await admin
    .from("rule_triggers")
    .update({ link_delivered_at: new Date().toISOString() })
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .is("link_delivered_at", null)
    .select("rule_id")
    .maybeSingle();
  if (!locked) return;

  const startedAt = Date.now();
  let status: InteractionStatus = "replied";
  let errorDetail: string | null = null;

  try {
    const token = await getFreshToken(admin, account);
    await sleep(clampDelay(rule.delay_seconds) * 1000);
    await sendRuleReply(token, senderId, rule);
  } catch (err) {
    status = "error";
    errorDetail = err instanceof Error ? err.message : String(err);
    if (err instanceof GraphApiError && err.code === 190) {
      await admin
        .from("ig_accounts")
        .update({ status: "expired" })
        .eq("id", account.id);
    }
  }

  await admin.from("interactions").insert({
    account_id: account.id,
    ig_sender_id: senderId,
    message_text: "[link do comentário entregue após toque no botão]",
    matched_rule_id: rule.id,
    matched_keyword: rule.keyword,
    status,
    reply_type: rule.reply_type,
    error_detail: errorDetail,
    latency_ms: Date.now() - startedAt,
  });
}

/** Toque num botão de ramificação de uma sequência (nó de botões do canvas). */
async function processSequencePostbackEvent(
  igBusinessId: string,
  senderId: string,
  mid: string | undefined,
  payload: string
): Promise<void> {
  const admin = createAdminClient();

  if (mid) {
    const { error: dedupError } = await admin
      .from("processed_events")
      .insert({ mid });
    if (dedupError) return;
  }

  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", igBusinessId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  if (!account) return;

  const startedAt = Date.now();
  const outcome = await handleSequencePostback(admin, account, senderId, payload);
  if (!outcome) return;

  await logSequenceInteraction(
    admin,
    account,
    senderId,
    "[sequência: botão tocado]",
    outcome,
    startedAt
  );
}

/** Alguém comentou numa publicação/Reel da conta. */
async function processCommentEvent(
  igBusinessId: string,
  entryTimeSeconds: number | undefined,
  value: CommentValue
): Promise<void> {
  const commentId = value.id;
  const senderId = value.from?.id;
  const text = value.text;
  const mediaId = value.media?.id;
  if (!commentId || !senderId || !text || !mediaId) return;

  const admin = createAdminClient();

  // Idempotência: Meta pode reentregar a notificação do mesmo comentário
  const { error: dedupError } = await admin
    .from("processed_events")
    .insert({ mid: commentId });
  if (dedupError) return;

  const recipientId = igBusinessId || "";
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("ig_user_id", recipientId)
    .eq("status", "active")
    .maybeSingle<IgAccount>();
  if (!account) return;

  // Nunca reage a um comentário feito pela própria conta — evita loop com a
  // resposta pública opcional, que também dispara este mesmo webhook.
  if (senderId === account.ig_user_id) return;

  const startedAt = Date.now();

  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", account.id)
    .eq("trigger_type", "comment")
    .eq("is_active", true);

  const rule = findMatchingCommentRule(text, mediaId, (rules ?? []) as Rule[]);

  let status: InteractionStatus;
  let errorDetail: string | null = null;

  if (!rule) {
    status = "no_match";
  } else {
    const result = await applyCommentRule(
      admin,
      account,
      rule,
      senderId,
      commentId,
      entryTimeSeconds
    );
    status = result.status;
    errorDetail = result.errorDetail ?? null;
  }

  await admin.from("interactions").insert({
    account_id: account.id,
    ig_sender_id: senderId,
    message_text: text.slice(0, 2000),
    matched_rule_id: rule?.id ?? null,
    matched_keyword: rule?.keyword ?? null,
    status,
    reply_type: rule ? "buttons" : null,
    error_detail: errorDetail,
    latency_ms: Date.now() - startedAt,
  });
}

async function applyCommentRule(
  admin: AdminClient,
  account: IgAccount,
  rule: Rule,
  senderId: string,
  commentId: string,
  entryTimeSeconds: number | undefined
): Promise<{ status: InteractionStatus; errorDetail?: string }> {
  // Anti-duplicidade: mesma regra nunca dispara 2x para o mesmo usuário
  const { data: alreadyTriggered } = await admin
    .from("rule_triggers")
    .select("rule_id")
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle();
  if (alreadyTriggered) return { status: "duplicate_skip" };

  // A Meta só aceita resposta privada em até 7 dias após o comentário
  // ("time" do webhook vem em segundos, diferente do "timestamp" de mensagens em ms).
  if (
    entryTimeSeconds &&
    Date.now() - entryTimeSeconds * 1000 > PRIVATE_REPLY_WINDOW_MS
  ) {
    return { status: "window_expired" };
  }

  await sleep(clampDelay(rule.delay_seconds) * 1000);

  try {
    const token = await getFreshToken(admin, account);

    await sendPrivateReplyWithButton(
      token,
      commentId,
      rule.welcome_text ?? "",
      rule.welcome_button_label ?? "",
      `${COMMENT_LINK_PAYLOAD_PREFIX}${rule.id}`
    );

    if (rule.public_reply_enabled && rule.public_reply_text) {
      try {
        await replyToComment(token, commentId, rule.public_reply_text);
      } catch (err) {
        // Não derruba a automação por isso: a resposta privada (o que
        // importa) já saiu. Só fica registrado no console.
        console.warn(
          `[process] falha na resposta pública do comentário ${commentId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  } catch (err) {
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

  await admin.from("rule_triggers").upsert(
    { rule_id: rule.id, account_id: account.id, ig_sender_id: senderId },
    { onConflict: "rule_id,ig_sender_id", ignoreDuplicates: true }
  );

  return { status: "replied" };
}

