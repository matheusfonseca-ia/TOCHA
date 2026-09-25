import { isExpired, withoutExpired } from "@/lib/expiry/expiry";
import { expireAutomationsSafe } from "@/lib/expiry/sweep";
import { isFollowGateOn } from "@/lib/follow-gate/copy";
import { holdUnlessFollowing, isHeldByFollowGate } from "@/lib/follow-gate/gate";
import { parseFollowCheckPayload } from "@/lib/follow-gate/payload";
import {
  clampDelay,
  findMatchingCommentRule,
  findMatchingRule,
} from "@/lib/rules/engine";
import { pickVariant } from "@/lib/rules/variants";
import { classifyInboundEvent, type ClassifiedInboundEvent } from "@/lib/meta/triggers";
import { sendRuleReply } from "@/lib/sequences/automation";
import { isPausedAt } from "@/lib/sequences/automation-pause";
import {
  handleSequencePostback,
  handleSequenceReply,
  invocationDeadline,
  isSequencePayload,
  maybeStartSequence,
  processDueRunsSafe,
  startSequenceFromRule,
  type SequenceOutcome,
} from "@/lib/sequences/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, InteractionStatus, Rule } from "@/types/database";
import {
  GraphApiError,
  replyToComment,
  sendPrivateReplyWithButton,
} from "./graph";
import { getFreshToken } from "./token";

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
// Limite da própria Meta para resposta privada a um comentário.
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Prefixo do payload do botão postback da mensagem de boas-vindas —
// carrega o id da regra até o toque no botão (evento messaging_postbacks).
const COMMENT_LINK_PAYLOAD_PREFIX = "falow:comment_link:";
// O produto se chamou InstaReply até 2026-07-28. Botões já entregues em DMs
// carregam o payload antigo para sempre, então continuamos aceitando na leitura.
const COMMENT_LINK_PAYLOAD_PREFIX_LEGACY = "instareply:comment_link:";
const RULE_EXPIRED_DURING_DELAY = "A automação expirou antes do envio.";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Linha de rule_triggers; follow_gate_sent_at só existe depois da migration 0007. */
interface RuleTriggerRow {
  link_delivered_at: string | null;
  follow_gate_sent_at?: string | null;
}

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
    /** Resposta a um story da conta (gatilho "storyReply"). */
    reply_to?: { story?: { id?: string; url?: string } };
    /** Menção em story traz `attachments[].type === "story_mention"`. */
    attachments?: { type?: string; payload?: { url?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
  /** ig.me/m/<usuário>?ref=<código> abrindo a conversa (gatilho "refLink"). */
  referral?: { ref?: string; source?: string; type?: string };
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
 * Atualiza a conversa: a janela de 24h da Meta conta a partir da última
 * mensagem/toque recebido da pessoa. Usa o horário do evento (não o de
 * processamento) e só avança: um webhook reentregue atrasado nunca "volta"
 * last_inbound_at para trás.
 */
async function touchConversation(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  eventTimestampMs: number | undefined
): Promise<void> {
  const now = Date.now();
  // Relógio da Meta adiantado ou timestamp ausente → usa o nosso.
  const at = new Date(
    eventTimestampMs && eventTimestampMs <= now ? eventTimestampMs : now
  ).toISOString();

  // 1º contato cria a linha; se ela já existe, o UPDATE abaixo decide.
  await admin.from("conversations").upsert(
    { account_id: accountId, ig_sender_id: senderId, last_inbound_at: at },
    { onConflict: "account_id,ig_sender_id", ignoreDuplicates: true }
  );
  await admin
    .from("conversations")
    .update({ last_inbound_at: at })
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .lt("last_inbound_at", at);
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

  const invocationStart = Date.now();
  // Orçamento de tempo único para a invocação inteira: fluxos iniciados aqui
  // não ganham um prazo novo a cada evento.
  const deadline = invocationDeadline(invocationStart);

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      await processMessagingEvent(entry.id ?? "", event, deadline);
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
  // em nós de atraso cujo horário venceu (complementa a rota de cron). O
  // orçamento conta desde o início da invocação — o que sobrou dela.
  // A expiração vem antes: workflow que acabou de vencer não retoma atrasos.
  await expireAutomationsSafe();
  await processDueRunsSafe(3, invocationDeadline(invocationStart));
}

async function processMessagingEvent(
  igBusinessId: string,
  event: MessagingEvent,
  deadline: number
): Promise<void> {
  if (event.postback) {
    await processPostbackEvent(igBusinessId, event, deadline);
    return;
  }

  const senderId = event.sender?.id;
  if (!senderId || event.message?.is_echo) return;

  // Classifica o evento (DM / resposta a story / menção em story / link de
  // referência). null = nada que interesse (sem texto, sem story, sem
  // referral) — ex.: eco já tratado acima, delivery receipt sem conteúdo.
  const classified = classifyInboundEvent(event);
  if (!classified) return;

  const admin = createAdminClient();

  // 1. Idempotência: insert falha em mid repetido → evento já processado.
  // Um referral "puro" (ig.me abrindo a conversa, sem mensagem) pode não
  // trazer mid — segue sem dedupe por mid; o unique de sequence_runs cobre
  // uma eventual reentrega dobrada do webhook.
  const mid = event.message?.mid;
  if (mid) {
    const { error: dedupError } = await admin
      .from("processed_events")
      .insert({ mid });
    if (dedupError) return;
  }

  // 2. Conta ativa que recebeu o evento
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
  await touchConversation(admin, account.id, senderId, event.timestamp);

  // 4a. Sequência esperando esta pessoa? Continuação tem prioridade sobre
  // regras/gatilhos novos: quem está no meio de um fluxo não deve ser
  // "sequestrado" (cobre quick replies e o nó "esperar resposta"). Evento
  // sem texto (menção em story, abertura por link) não é resposta: não
  // retoma nada nem gasta tentativa do "Coletar dado".
  const seqReply = classified.text
    ? await handleSequenceReply(
        admin,
        account,
        senderId,
        event.message?.quick_reply?.payload,
        classified.text
      )
    : null;
  if (seqReply) {
    await logSequenceInteraction(
      admin,
      account,
      senderId,
      classified.text,
      seqReply,
      startedAt
    );
    return;
  }

  // 4a-bis. Nó "Pausar automações" ativo para esta pessoa: não inicia regra
  // nem workflow novo (quem já estava no meio de um fluxo já retornou acima).
  const pausedUntil = await automationPausedUntil(admin, account.id, senderId);
  if (pausedUntil) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: classified.text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: `Automações pausadas até ${pausedUntil}`,
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  // 4b. Gatilho específico (resposta ou menção em story, link de referência)
  // vem antes de tudo: foi configurado exatamente para esse tipo de evento.
  if (classified.kind !== "dm") {
    const specific = await maybeStartSequence(admin, account, senderId, classified, deadline);
    if (specific) {
      await logSequenceInteraction(admin, account, senderId, classified.text, specific, startedAt);
      return;
    }
  }

  // Sem texto (menção pura, abertura por link) e sem workflow específico:
  // nada a responder e nada útil a registrar.
  if (!classified.text) return;

  // 4c. Com texto, o evento também vale como DM comum: resposta a story com
  // "preço" continua acionando a automação de DM "preço", como antes dos
  // gatilhos de story existirem. Regras vencidas (expiração) são ignoradas
  // mesmo antes do sweep rodar.
  const asDm: ClassifiedInboundEvent = { kind: "dm", text: classified.text };
  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", account.id)
    .eq("trigger_type", "dm")
    .eq("is_active", true);

  const rule: Rule | null = findMatchingRule(
    asDm.text,
    withoutExpired((rules ?? []) as Rule[])
  );
  const result: { status: InteractionStatus; errorDetail?: string } | null = rule
    ? await applyRule(admin, account, rule, senderId, event)
    : null;

  // 4d. Nenhuma regra respondeu (não casou, ou casou mas já tinha disparado
  // para esta pessoa: duplicate_skip) → workflows de palavra-chave na DM.
  // Decisão do usuário: duplicate_skip da regra não bloqueia o workflow.
  if (!result || result.status === "duplicate_skip") {
    const seqStart = await maybeStartSequence(
      admin,
      account,
      senderId,
      asDm,
      deadline
    );
    if (seqStart) {
      await logSequenceInteraction(
        admin,
        account,
        senderId,
        classified.text,
        seqStart,
        startedAt
      );
      return;
    }
  }

  const status: InteractionStatus = result?.status ?? "no_match";
  const errorDetail = result?.errorDetail ?? null;

  // 8. Log da interação
  await admin.from("interactions").insert({
    account_id: account.id,
    ig_sender_id: senderId,
    message_text: classified.text.slice(0, 2000),
    matched_rule_id: rule?.id ?? null,
    matched_keyword: rule?.keyword ?? null,
    status,
    reply_type: rule?.reply_type ?? null,
    error_detail: errorDetail,
    latency_ms: Date.now() - startedAt,
  });

  // 9. A regra respondeu agora → continua o workflow que a usa como entrada.
  if (rule && status === "replied") {
    const handoffStartedAt = Date.now();
    const handoff = await startSequenceFromRule(
      admin, account, senderId, rule, deadline
    );
    if (handoff) {
      await logSequenceInteraction(
        admin,
        account,
        senderId,
        "[sequência: iniciada pela automação]",
        handoff,
        handoffStartedAt
      );
    }
  }
}

/**
 * "Pausar automações" (nó `stopAutomation`): devolve o timestamp (ISO) até
 * quando a pessoa está pausada, ou null se não está (nunca pausada, ou a
 * pausa já venceu).
 */
async function automationPausedUntil(
  admin: AdminClient,
  accountId: string,
  senderId: string
): Promise<string | null> {
  const { data } = await admin
    .from("conversations")
    .select("automation_paused_until")
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .maybeSingle<{ automation_paused_until: string | null }>();
  const until = data?.automation_paused_until ?? null;
  return isPausedAt(until) ? until : null;
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
  // 5. Anti-duplicidade: mesma regra nunca dispara 2x para o mesmo usuário,
  // exceto conteúdo retido no portão de seguidor: pedir de novo confere de
  // novo se a pessoa já segue. `select("*")` funciona antes e depois da
  // migration 0007 (coluna follow_gate_sent_at).
  const { data: trigger } = await admin
    .from("rule_triggers")
    .select("*")
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle<RuleTriggerRow>();
  const heldByGate = isHeldByFollowGate(trigger);
  if (trigger && !heldByGate) return { status: "duplicate_skip" };

  // 6. Janela de 24h: se o evento chegou atrasado (retry do Meta), não responde
  if (event.timestamp && Date.now() - event.timestamp > WINDOW_24H_MS) {
    return { status: "window_expired" };
  }

  // 7. Delay humanizado (regra de negócio: 2–5s)
  await sleep(clampDelay(rule.delay_seconds) * 1000);
  // A expiração pode ter passado durante a pausa.
  if (isExpired(rule.expires_at)) {
    return { status: "no_match", errorDetail: RULE_EXPIRED_DURING_DELAY };
  }

  let gateDetail: string | undefined;
  let locked = false;
  try {
    const token = await getFreshToken(admin, account);

    // 7b. Portão "Seguir para liberar": a DM já deu consentimento para a
    // User Profile API, então dá para conferir antes do conteúdo.
    if (isFollowGateOn(rule)) {
      const gate = await holdUnlessFollowing(admin, account, rule, senderId, token, {
        again: heldByGate,
      });
      if (gate.held) return { status: "awaiting_follow" };
      gateDetail = gate.detail;
    }
    // Conteúdo que estava retido: mesma trava atômica do toque em "Já segui".
    if (heldByGate) {
      locked = await lockDelivery(admin, rule.id, senderId);
      if (!locked) return { status: "duplicate_skip" };
    }

    await sendRuleReply(token, senderId, rule);
  } catch (err) {
    // Envio falhou: devolve a trava, senão o próximo pedido viraria duplicado.
    if (locked) await releaseDelivery(admin, rule.id, senderId);
    // Token inválido/expirado → marca a conta para reconexão
    await markExpiredOnInvalidToken(admin, account, err);
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
  // Com portão, a entrega também fica marcada: um portão enviado em paralelo
  // (outra DM do mesmo pedido) não deixa o conteúdo já entregue como retido.
  if (isFollowGateOn(rule) && !locked) {
    await admin
      .from("rule_triggers")
      .update({ link_delivered_at: new Date().toISOString() })
      .eq("rule_id", rule.id)
      .eq("ig_sender_id", senderId)
      .is("link_delivered_at", null);
  }

  return { status: "replied", errorDetail: gateDetail };
}

/** Token inválido/expirado (código 190) → marca a conta para reconexão. */
async function markExpiredOnInvalidToken(
  admin: AdminClient,
  account: IgAccount,
  err: unknown
): Promise<void> {
  if (err instanceof GraphApiError && err.code === 190) {
    await admin.from("ig_accounts").update({ status: "expired" }).eq("id", account.id);
  }
}

/**
 * Trava a entrega do conteúdo a 1x por pessoa por regra: UPDATE atômico
 * condicionado a link_delivered_at IS NULL. Cobre 2º toque no botão,
 * reentrega do webhook sem "mid" e toques simultâneos.
 */
async function lockDelivery(
  admin: AdminClient,
  ruleId: string,
  senderId: string
): Promise<boolean> {
  const { data: locked } = await admin
    .from("rule_triggers")
    .update({ link_delivered_at: new Date().toISOString() })
    .eq("rule_id", ruleId)
    .eq("ig_sender_id", senderId)
    .is("link_delivered_at", null)
    .select("rule_id")
    .maybeSingle();
  return !!locked;
}

/** Desfaz a trava quando o envio falhou: a pessoa pode pedir (ou tocar) de novo. */
async function releaseDelivery(
  admin: AdminClient,
  ruleId: string,
  senderId: string
): Promise<void> {
  await admin
    .from("rule_triggers")
    .update({ link_delivered_at: null })
    .eq("rule_id", ruleId)
    .eq("ig_sender_id", senderId);
}

/**
 * Toque num botão de automação:
 *  - botão da mensagem de boas-vindas do fluxo de comentário: a resposta
 *    privada já abriu a janela de mensagens, então a 2ª mensagem (o link)
 *    sai como DM normal (recipient.id);
 *  - "Já segui" do portão de seguidor (automação de comentário ou de DM).
 * Com o portão ligado, quem não segue recebe o portão no lugar do conteúdo.
 */
async function processPostbackEvent(
  igBusinessId: string,
  event: MessagingEvent,
  deadline: number
): Promise<void> {
  const senderId = event.sender?.id;
  const mid = event.postback?.mid;
  const payload = event.postback?.payload;
  if (!senderId || !payload) return;

  // Botão de ramificação de uma sequência (nó de botões do canvas)
  if (isSequencePayload(payload)) {
    await processSequencePostbackEvent(
      igBusinessId,
      senderId,
      mid,
      payload,
      event.timestamp
    );
    return;
  }

  // "Já segui" vale para automação de comentário e de DM; o botão de
  // boas-vindas só existe na de comentário.
  const followCheckRuleId = parseFollowCheckPayload(payload);
  const commentLinkPrefix = followCheckRuleId
    ? undefined
    : [COMMENT_LINK_PAYLOAD_PREFIX, COMMENT_LINK_PAYLOAD_PREFIX_LEGACY].find((p) =>
        payload.startsWith(p)
      );
  const ruleId =
    followCheckRuleId ??
    (commentLinkPrefix ? payload.slice(commentLinkPrefix.length) : null);
  if (!ruleId) return;

  const admin = createAdminClient();

  if (mid) {
    const { error: dedupError } = await admin
      .from("processed_events")
      .insert({ mid });
    if (dedupError) return;
  }

  const recipientId = igBusinessId || event.recipient?.id || "";

  let ruleQuery = admin
    .from("rules")
    .select("*")
    .eq("id", ruleId)
    .eq("is_active", true);
  if (!followCheckRuleId) ruleQuery = ruleQuery.eq("trigger_type", "comment");

  const [{ data: account }, { data: rule }] = await Promise.all([
    admin
      .from("ig_accounts")
      .select("*")
      .eq("ig_user_id", recipientId)
      .eq("status", "active")
      .maybeSingle<IgAccount>(),
    ruleQuery.maybeSingle<Rule>(),
  ]);
  // rule.account_id !== account.id nunca deveria acontecer (o payload só é
  // gerado por nós, pra uma regra da própria conta), mas checar explicita é
  // mais barato do que confiar nisso implicitamente.
  if (!account || !rule || rule.account_id !== account.id) return;
  if (isExpired(rule.expires_at)) return;

  // O toque no botão é uma interação da pessoa: abre/renova a janela de 24h.
  // Sem isso o workflow iniciado logo abaixo morreria em window_expired
  // (a conversa nem existia, só houve o comentário).
  await touchConversation(admin, account.id, senderId, event.timestamp);

  // Já entregue (2º toque, reentrega do webhook): não confere nem manda o
  // portão de novo. A trava de verdade é o UPDATE atômico de lockDelivery.
  const { data: trigger } = await admin
    .from("rule_triggers")
    .select("*")
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle<RuleTriggerRow>();
  if (!trigger || trigger.link_delivered_at) return;

  const startedAt = Date.now();
  const logTap = (status: InteractionStatus, messageText: string, errorDetail: string | null) =>
    admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: messageText,
      matched_rule_id: rule.id,
      matched_keyword: rule.keyword,
      status,
      reply_type: rule.reply_type,
      error_detail: errorDetail,
      latency_ms: Date.now() - startedAt,
    });

  // "Pausar automações" vale para os toques também, como na DM e no
  // comentário: nada é entregue e o conteúdo continua esperando.
  const pausedUntil = await automationPausedUntil(admin, account.id, senderId);
  if (pausedUntil) {
    await logTap(
      "no_match",
      "[toque em botão da automação]",
      `Automações pausadas até ${pausedUntil}`
    );
    return;
  }

  // Portão "Seguir para liberar": o toque no botão já deu consentimento
  // para a User Profile API (confirmado em produção em 25/09/2026).
  let gateDetail: string | null = null;
  if (isFollowGateOn(rule)) {
    try {
      const token = await getFreshToken(admin, account);
      const gate = await holdUnlessFollowing(admin, account, rule, senderId, token, {
        again: !!followCheckRuleId,
        delayMs: clampDelay(rule.delay_seconds) * 1000,
      });
      if (gate.held) {
        await logTap(
          "awaiting_follow",
          followCheckRuleId
            ? "[tocou em Já segui, mas ainda não segue a conta]"
            : "[pediu o link sem seguir a conta: portão enviado]",
          null
        );
        return;
      }
      gateDetail = gate.detail ?? null;
    } catch (err) {
      await markExpiredOnInvalidToken(admin, account, err);
      await logTap(
        "error",
        "[falha ao enviar o portão de seguidor]",
        err instanceof Error ? err.message : String(err)
      );
      return;
    }
  }

  if (!(await lockDelivery(admin, rule.id, senderId))) return;

  let status: InteractionStatus = "replied";
  let errorDetail: string | null = gateDetail;

  try {
    const token = await getFreshToken(admin, account);
    await sleep(clampDelay(rule.delay_seconds) * 1000);
    await sendRuleReply(token, senderId, rule);
  } catch (err) {
    status = "error";
    errorDetail = err instanceof Error ? err.message : String(err);
    // Devolve a trava: um novo toque tenta de novo (antes o link se perdia).
    await releaseDelivery(admin, rule.id, senderId);
    await markExpiredOnInvalidToken(admin, account, err);
  }

  await logTap(
    status,
    followCheckRuleId
      ? "[conteúdo entregue após seguir a conta]"
      : "[link do comentário entregue após toque no botão]",
    errorDetail
  );

  // Conteúdo entregue → continua o workflow que usa esta automação como
  // entrada (workflow pausado ou inexistente: a regra respondeu sozinha).
  if (status !== "replied") return;
  const handoffStartedAt = Date.now();
  const handoff = await startSequenceFromRule(
    admin, account, senderId, rule, deadline
  );
  if (handoff) {
    await logSequenceInteraction(
      admin,
      account,
      senderId,
      rule.trigger_type === "comment"
        ? "[sequência: iniciada pela automação de comentário]"
        : "[sequência: iniciada pela automação]",
      handoff,
      handoffStartedAt
    );
  }
}

/** Toque num botão de ramificação de uma sequência (nó de botões do canvas). */
async function processSequencePostbackEvent(
  igBusinessId: string,
  senderId: string,
  mid: string | undefined,
  payload: string,
  eventTimestampMs: number | undefined
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

  // Toque no botão também conta como interação para a janela de 24h.
  await touchConversation(admin, account.id, senderId, eventTimestampMs);

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

  // "Pausar automações" vale para comentário também: a automação de
  // comentário é a porta de entrada dos workflows ligados a ela.
  const pausedUntil = await automationPausedUntil(admin, account.id, senderId);
  if (pausedUntil) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: `Automações pausadas até ${pausedUntil}`,
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", account.id)
    .eq("trigger_type", "comment")
    .eq("is_active", true);

  const rule = findMatchingCommentRule(
    text,
    mediaId,
    withoutExpired((rules ?? []) as Rule[])
  );

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
  if (isExpired(rule.expires_at)) {
    return { status: "no_match", errorDetail: RULE_EXPIRED_DURING_DELAY };
  }

  try {
    const token = await getFreshToken(admin, account);

    // Sorteia uma variante a cada disparo (mesma regra pode ter mais de um
    // texto cadastrado); com só uma variante, é ela sempre.
    const welcomeText =
      pickVariant(rule.welcome_text, rule.welcome_text_variants) ?? "";

    await sendPrivateReplyWithButton(
      token,
      commentId,
      welcomeText,
      rule.welcome_button_label ?? "",
      `${COMMENT_LINK_PAYLOAD_PREFIX}${rule.id}`
    );

    const publicReplyText = rule.public_reply_enabled
      ? pickVariant(rule.public_reply_text, rule.public_reply_variants)
      : null;

    if (publicReplyText) {
      try {
        await replyToComment(token, commentId, publicReplyText);
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

