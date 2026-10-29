import { isExpired, withoutExpired } from "@/lib/expiry/expiry";
import { isFollowGateOn } from "@/lib/follow-gate/copy";
import { holdUnlessFollowing, isHeldByFollowGate } from "@/lib/follow-gate/gate";
import { parseFollowCheckPayload } from "@/lib/follow-gate/payload";
import {
  clampDelay,
  findMatchingCommentRule,
  findMatchingRule,
} from "@/lib/rules/engine";
import { pickVariant } from "@/lib/rules/variants";
import { findServedAccount } from "@/lib/meta/served-account";
import { classifyInboundEvent, type ClassifiedInboundEvent } from "@/lib/meta/triggers";
import { sendRuleReply } from "@/lib/sequences/automation";
import { isPausedAt } from "@/lib/sequences/automation-pause";
import {
  handleSequencePostback,
  handleSequenceReply,
  invocationDeadline,
  isSequencePayload,
  loadActiveSequences,
  maybeStartSequence,
  startSequenceFromRule,
  type SequenceOutcome,
} from "@/lib/sequences/runtime";
import { TokenUndecryptableError } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import { captureMessagingEvent, observeOutbound } from "@/modules/crm/server";
import type { IgAccount, InteractionStatus, Rule } from "@/types/database";
import type { Sequence } from "@/types/sequence";
import {
  countSends,
  GraphApiError,
  replyToComment,
  sendPrivateReplyWithButton,
  type SendTally,
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

// Unique violation do Postgres (mid já processado, regra já disparada).
const PG_UNIQUE_VIOLATION = "23505";
// Eventos de pessoas diferentes do mesmo lote rodam em paralelo (os da mesma
// pessoa, em ordem). Mantém o lote dentro do orçamento da invocação.
const EVENT_CONCURRENCY = 4;
// Evento que falhou antes de falar com a pessoa: 1 nova tentativa na mesma
// invocação (o webhook já respondeu 200, a Meta não vai reenviar).
const EVENT_RETRY_DELAY_MS = 1_000;
const EVENT_RETRY_MIN_BUDGET_MS = 10_000;

/** Estado compartilhado pelos eventos de uma mesma entrega do webhook. */
interface Invocation {
  admin: AdminClient;
  /** Orçamento único da invocação: fluxos não ganham prazo novo por evento. */
  deadline: number;
  /** Conta + acesso, resolvidos 1x por invocação (não por evento). */
  servedAccount(igUserId: string): Promise<IgAccount | null>;
  /** Workflows ativos da conta, carregados 1x por invocação. */
  activeSequences(accountId: string): Promise<Sequence[]>;
}

/** Contexto de uma tentativa de processar um evento. */
interface EventScope {
  /** Chave gravada em processed_events por esta tentativa (liberada se falhar sem enviar nada). */
  claimedKey: string | null;
}

function memoize<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key) => {
    let pending = cache.get(key);
    if (!pending) {
      pending = load(key);
      // Falha não fica em cache: a nova tentativa do evento lê de novo.
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return pending;
  };
}

function createInvocation(startedAt: number): Invocation {
  const admin = createAdminClient();
  return {
    admin,
    deadline: invocationDeadline(startedAt),
    servedAccount: memoize((igUserId) => findServedAccount(admin, igUserId)),
    activeSequences: memoize((accountId) => loadActiveSequences(admin, accountId)),
  };
}

/**
 * Idempotência por evento: grava a chave (mid ou id do comentário) em
 * processed_events. false = já processado (reentrega). Erro que não é de
 * duplicidade lança, para o evento não ser dado como tratado por engano.
 */
async function claimEvent(inv: Invocation, scope: EventScope, key: string): Promise<boolean> {
  const { error } = await inv.admin.from("processed_events").insert({ mid: key });
  if (!error) {
    scope.claimedKey = key;
    return true;
  }
  if (error.code === PG_UNIQUE_VIOLATION) return false;
  throw new Error(`Falha ao registrar o evento ${key}: ${error.message}`);
}

/**
 * Roda o processamento de um evento. Se lançar ANTES de qualquer mensagem
 * sair para a pessoa, a chave de dedupe é liberada (uma reentrega da Meta
 * pode reprocessar) e o evento é tentado mais 1x se ainda houver orçamento.
 * Se algo já saiu, não repete: a pessoa receberia em dobro.
 */
async function runEvent(
  inv: Invocation,
  label: string,
  job: (scope: EventScope) => Promise<void>
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const scope: EventScope = { claimedKey: null };
    const tally: SendTally = { sent: 0 };
    try {
      await countSends(tally, () => job(scope));
      return;
    } catch (err) {
      const nothingSent = tally.sent === 0;
      if (scope.claimedKey && nothingSent) {
        const { error } = await inv.admin
          .from("processed_events")
          .delete()
          .eq("mid", scope.claimedKey);
        if (error) console.warn(`[webhook] falha ao liberar ${scope.claimedKey}:`, error.message);
      }
      const retry =
        nothingSent &&
        attempt === 0 &&
        Date.now() + EVENT_RETRY_DELAY_MS + EVENT_RETRY_MIN_BUDGET_MS < inv.deadline;
      console.error(
        `[webhook] falha ao processar ${label}${retry ? " (nova tentativa)" : ""}:`,
        err instanceof Error ? err.message : err
      );
      if (!retry) return;
      await sleep(EVENT_RETRY_DELAY_MS);
    }
  }
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
  // Só avança. Conversa criada pelo CRM a partir de um envio (resposta
  // privada a comentário, eco) nasce sem mensagem do lead: `lt` não casa
  // com nulo, daí o `is.null` no mesmo UPDATE.
  await admin
    .from("conversations")
    .update({ last_inbound_at: at })
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .or(`last_inbound_at.is.null,last_inbound_at.lt.${at}`);
}

/** O que o webhook precisa saber da conversa antes de qualquer automação. */
interface ConversationGate {
  /** "Assumir conversa" (D3): atendente no controle. */
  takenOver: boolean;
  /** Nó "Pausar automações" ativo até este instante (ISO), ou null. */
  pausedUntil: string | null;
}

/**
 * Atendimento humano e pausa de automações numa leitura só (antes eram duas
 * consultas à mesma linha). Erro de leitura lança: tratar como "livre"
 * deixaria o bot responder por cima do atendente.
 */
async function readConversationGate(
  admin: AdminClient,
  accountId: string,
  senderId: string
): Promise<ConversationGate> {
  const { data, error } = await admin
    .from("conversations")
    .select("human_takeover_at, automation_paused_until")
    .eq("account_id", accountId)
    .eq("ig_sender_id", senderId)
    .maybeSingle<{ human_takeover_at: string | null; automation_paused_until: string | null }>();
  if (error) throw new Error(`Falha ao ler a conversa: ${error.message}`);
  const until = data?.automation_paused_until ?? null;
  return {
    takenOver: Boolean(data?.human_takeover_at),
    pausedUntil: isPausedAt(until) ? until : null,
  };
}

/** Atualiza a janela de 24h e lê o estado da conversa em paralelo. */
async function touchAndReadConversation(
  admin: AdminClient,
  accountId: string,
  senderId: string,
  eventTimestampMs: number | undefined
): Promise<ConversationGate> {
  const [, gate] = await Promise.all([
    touchConversation(admin, accountId, senderId, eventTimestampMs),
    readConversationGate(admin, accountId, senderId),
  ]);
  return gate;
}

/** Regras ativas da conta para o tipo de gatilho; erro de leitura lança (não vira no_match). */
async function loadActiveRules(
  admin: AdminClient,
  accountId: string,
  triggerType: "dm" | "comment"
): Promise<Rule[]> {
  const { data, error } = await admin
    .from("rules")
    .select("*")
    .eq("account_id", accountId)
    .eq("trigger_type", triggerType)
    .eq("is_active", true);
  if (error) throw new Error(`Falha ao ler as automações: ${error.message}`);
  return withoutExpired((data ?? []) as Rule[]);
}

/** Roda `worker` sobre os itens com no máximo `concurrency` ao mesmo tempo. */
async function forEachConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

interface EventJob {
  /** Conta + pessoa: eventos com a mesma chave rodam em série, na ordem do lote. */
  key: string;
  igBusinessId: string;
  run: () => Promise<void>;
}

/**
 * Pipeline por evento recebido:
 *  - mensagens diretas (`messaging[].message`) → ver `processMessagingEvent`
 *  - toque no botão da mensagem de boas-vindas (`messaging[].postback`) → `processPostbackEvent`
 *  - comentários (`field`/`value` ou `changes[]` = "comments") → `processCommentEvent`
 * Todos compartilham: idempotência, busca da conta pelo `entry.id`, matching
 * de regras, anti-duplicidade por (regra, usuário) e log em `interactions`.
 *
 * Eventos de pessoas diferentes rodam em paralelo (até EVENT_CONCURRENCY);
 * os da mesma pessoa, em série. Expiração e retomada de atrasos ficam só no
 * cron (a cada minuto): rodar aqui custava ~6 consultas por webhook.
 */
export async function processWebhookPayload(
  payload: MetaWebhookPayload
): Promise<void> {
  if (payload.object !== "instagram") return;

  const inv = createInvocation(Date.now());

  const jobs: EventJob[] = [];
  for (const entry of payload.entry ?? []) {
    const igBusinessId = entry.id ?? "";
    for (const event of entry.messaging ?? []) {
      jobs.push({
        key: `${igBusinessId}:${event.sender?.id ?? ""}`,
        igBusinessId,
        run: () => processMessagingEvent(inv, igBusinessId, event),
      });
    }

    const comments = [
      ...(entry.field === "comments" && entry.value ? [entry.value] : []),
      ...(entry.changes ?? [])
        .filter((change) => change.field === "comments" && change.value)
        .map((change) => change.value as CommentValue),
    ];
    for (const value of comments) {
      jobs.push({
        key: `${igBusinessId}:${value.from?.id ?? ""}`,
        igBusinessId,
        run: () =>
          runEvent(inv, `comentário ${value.id ?? "?"}`, (scope) =>
            processCommentEvent(inv, scope, igBusinessId, entry.time, value)
          ),
      });
    }
  }

  const groups = new Map<string, EventJob[]>();
  for (const job of jobs) {
    const group = groups.get(job.key);
    if (group) group.push(job);
    else groups.set(job.key, [job]);
  }

  await forEachConcurrent(Array.from(groups.values()), EVENT_CONCURRENCY, async (group) => {
    for (const job of group) {
      // CRM: tudo que as regras enviarem nesta conta fica gravado como
      // "automação" (workflows sobrescrevem com "workflow" no runtime).
      await observeOutbound({ igUserId: job.igBusinessId, source: "automation" }, job.run);
    }
  });
}

/**
 * O CRM grava o evento (mensagem, eco, reação, edição, visto) em paralelo com
 * as automações: `captureMessagingEvent` nunca lança, então uma falha no CRM
 * não atrasa nem derruba a resposta automática. Roda 1x por evento, mesmo
 * quando a automação é tentada de novo.
 */
async function processMessagingEvent(
  inv: Invocation,
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  const capture = captureMessagingEvent(igBusinessId, event);
  try {
    await runEvent(
      inv,
      `evento ${event.message?.mid ?? event.postback?.mid ?? "sem mid"}`,
      (scope) => handleMessagingEvent(inv, scope, igBusinessId, event)
    );
  } finally {
    await capture;
  }
}

async function handleMessagingEvent(
  inv: Invocation,
  scope: EventScope,
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  if (event.postback) {
    await processPostbackEvent(inv, scope, igBusinessId, event);
    return;
  }

  const senderId = event.sender?.id;
  if (!senderId || event.message?.is_echo) return;

  // Classifica o evento (DM / resposta a story / menção em story / link de
  // referência). null = nada que interesse (sem texto, sem story, sem
  // referral) — ex.: eco já tratado acima, delivery receipt sem conteúdo.
  const classified = classifyInboundEvent(event);
  if (!classified) return;

  const { admin, deadline } = inv;

  // 1. Idempotência: mid repetido → evento já processado.
  // Um referral "puro" (ig.me abrindo a conversa, sem mensagem) pode não
  // trazer mid — segue sem dedupe por mid; o unique de sequence_runs cobre
  // uma eventual reentrega dobrada do webhook.
  const mid = event.message?.mid;
  if (mid && !(await claimEvent(inv, scope, mid))) return;

  // 2. Conta ativa que recebeu o evento
  const recipientId = igBusinessId || event.recipient?.id || "";
  const account = await inv.servedAccount(recipientId);
  if (!account) return;

  const startedAt = Date.now();

  // 3. Atualiza a conversa (janela de 24h conta a partir da última inbound)
  // e lê, na mesma ida, se há atendente ou pausa de automações.
  const gate = await touchAndReadConversation(admin, account.id, senderId, event.timestamp);

  // 3-bis. Conversa assumida por um atendente (D3): nenhuma automação roda
  // para esta pessoa enquanto isso, nem a continuação de um workflow parado
  // esperando resposta. Só "Devolver ao bot" no painel libera de novo.
  if (gate.takenOver) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: classified.text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: "Conversa assumida por atendente",
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  // 4a. Sequência esperando esta pessoa? Continuação tem prioridade sobre
  // regras/gatilhos novos: quem está no meio de um fluxo não deve ser
  // "sequestrado" (cobre quick replies e o nó "esperar resposta"). Evento
  // sem texto (menção em story, abertura por link) não é resposta: não
  // retoma nada nem gasta tentativa do "Coletar dado".
  const quickReplyPayload = event.message?.quick_reply?.payload;
  const seqReply = classified.text
    ? await handleSequenceReply(
        admin,
        account,
        senderId,
        quickReplyPayload,
        classified.text,
        deadline
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

  // 4a-ter. Toque numa resposta rápida de um fluxo que já seguiu adiante (2º
  // toque, mensagem antiga, run encerrado): o texto é o título do botão, não
  // uma mensagem da pessoa. Não cai nas regras nem dispara outro fluxo.
  if (isSequencePayload(quickReplyPayload)) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: classified.text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: "Toque numa resposta rápida de um fluxo que já seguiu adiante: ignorado",
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  // 4a-bis. Nó "Pausar automações" ativo para esta pessoa: não inicia regra
  // nem workflow novo (quem já estava no meio de um fluxo já retornou acima).
  if (gate.pausedUntil) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: classified.text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: `Automações pausadas até ${gate.pausedUntil}`,
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  // 4b. Gatilho específico (resposta ou menção em story, link de referência)
  // vem antes de tudo: foi configurado exatamente para esse tipo de evento.
  if (classified.kind !== "dm") {
    const specific = await maybeStartSequence(
      admin,
      account,
      senderId,
      classified,
      deadline,
      await inv.activeSequences(account.id)
    );
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
  const rules = await loadActiveRules(admin, account.id, "dm");

  const rule: Rule | null = findMatchingRule(asDm.text, rules);
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
      deadline,
      await inv.activeSequences(account.id)
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

/**
 * Reserva o disparo (regra, pessoa) ANTES do envio: o insert é atômico (unique
 * em rule_id + ig_sender_id), então de duas entregas paralelas só uma ganha.
 * true = esta invocação reservou; false = a linha já existia.
 */
async function claimRuleTrigger(
  admin: AdminClient,
  ruleId: string,
  accountId: string,
  senderId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("rule_triggers")
    .insert({ rule_id: ruleId, account_id: accountId, ig_sender_id: senderId })
    .select("rule_id")
    .maybeSingle();
  if (data) return true;
  if (error && error.code !== PG_UNIQUE_VIOLATION) {
    throw new Error(`Falha ao reservar o disparo da automação: ${error.message}`);
  }
  return false;
}

/** Desfaz a reserva quando nada foi entregue: a pessoa pode pedir de novo. */
async function releaseRuleTrigger(
  admin: AdminClient,
  ruleId: string,
  senderId: string
): Promise<void> {
  const { error } = await admin
    .from("rule_triggers")
    .delete()
    .eq("rule_id", ruleId)
    .eq("ig_sender_id", senderId);
  if (error) {
    console.warn(`[process] falha ao liberar o disparo da regra ${ruleId}:`, error.message);
  }
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
  // novo se a pessoa já segue. A reserva vem antes da pausa e do envio, então
  // duas DMs paralelas da mesma pessoa não respondem 2x. `select("*")`
  // funciona antes e depois da migration 0007 (coluna follow_gate_sent_at).
  const claimed = await claimRuleTrigger(admin, rule.id, account.id, senderId);
  let heldByGate = false;
  if (!claimed) {
    const { data: trigger, error } = await admin
      .from("rule_triggers")
      .select("*")
      .eq("rule_id", rule.id)
      .eq("ig_sender_id", senderId)
      .maybeSingle<RuleTriggerRow>();
    if (error) throw new Error(`Falha ao ler o disparo da automação: ${error.message}`);
    heldByGate = isHeldByFollowGate(trigger);
    if (!heldByGate) return { status: "duplicate_skip" };
  }
  // Reserva desta invocação sem nada entregue: devolve.
  const releaseClaim = async () => {
    if (claimed) await releaseRuleTrigger(admin, rule.id, senderId);
  };

  // 6. Janela de 24h: se o evento chegou atrasado (retry do Meta), não responde
  if (event.timestamp && Date.now() - event.timestamp > WINDOW_24H_MS) {
    await releaseClaim();
    return { status: "window_expired" };
  }

  // 7. Delay humanizado (regra de negócio: 2–5s)
  await sleep(clampDelay(rule.delay_seconds) * 1000);
  // A expiração pode ter passado durante a pausa.
  if (isExpired(rule.expires_at)) {
    await releaseClaim();
    return { status: "no_match", errorDetail: RULE_EXPIRED_DURING_DELAY };
  }

  let gateDetail: string | undefined;
  let locked = false;
  try {
    const token = await getFreshToken(admin, account);

    // 7b. Portão "Seguir para liberar": a DM já deu consentimento para a
    // User Profile API, então dá para conferir antes do conteúdo. Repetir a
    // palavra-chave não faz a 2ª conferência com espera (só o "Já segui").
    if (isFollowGateOn(rule)) {
      const gate = await holdUnlessFollowing(admin, account, rule, senderId, token, {
        again: heldByGate,
        recheck: false,
      });
      // Portão enviado: a reserva vira o registro do conteúdo retido.
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
    // Envio falhou: devolve a trava/reserva, senão o próximo pedido viraria duplicado.
    if (locked) await releaseDelivery(admin, rule.id, senderId);
    else await releaseClaim();
    // Token inválido/expirado → marca a conta para reconexão
    await markExpiredOnInvalidToken(admin, account, err);
    return {
      status: "error",
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }

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

/**
 * Token inválido/expirado (código 190) ou que não decifra mais com a chave
 * atual (rotação/perda da TOKEN_ENCRYPTION_KEY) → marca a conta para reconexão.
 */
async function markExpiredOnInvalidToken(
  admin: AdminClient,
  account: IgAccount,
  err: unknown
): Promise<void> {
  if ((err instanceof GraphApiError && err.code === 190) || err instanceof TokenUndecryptableError) {
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
  inv: Invocation,
  scope: EventScope,
  igBusinessId: string,
  event: MessagingEvent
): Promise<void> {
  const senderId = event.sender?.id;
  const mid = event.postback?.mid;
  const payload = event.postback?.payload;
  if (!senderId || !payload) return;

  // Botão de ramificação de uma sequência (nó de botões do canvas)
  if (isSequencePayload(payload)) {
    await processSequencePostbackEvent(
      inv,
      scope,
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

  const { admin, deadline } = inv;

  if (mid && !(await claimEvent(inv, scope, mid))) return;

  const recipientId = igBusinessId || event.recipient?.id || "";

  let ruleQuery = admin
    .from("rules")
    .select("*")
    .eq("id", ruleId)
    .eq("is_active", true);
  if (!followCheckRuleId) ruleQuery = ruleQuery.eq("trigger_type", "comment");

  const [account, { data: rule, error: ruleError }] = await Promise.all([
    inv.servedAccount(recipientId),
    ruleQuery.maybeSingle<Rule>(),
  ]);
  if (ruleError) throw new Error(`Falha ao ler a automação: ${ruleError.message}`);
  // rule.account_id !== account.id nunca deveria acontecer (o payload só é
  // gerado por nós, pra uma regra da própria conta), mas checar explicita é
  // mais barato do que confiar nisso implicitamente.
  if (!account || !rule || rule.account_id !== account.id) return;
  if (isExpired(rule.expires_at)) return;

  // O toque no botão é uma interação da pessoa: abre/renova a janela de 24h.
  // Sem isso o workflow iniciado logo abaixo morreria em window_expired
  // (a conversa nem existia, só houve o comentário).
  const conversation = await touchAndReadConversation(admin, account.id, senderId, event.timestamp);

  // Já entregue (2º toque, reentrega do webhook): não confere nem manda o
  // portão de novo. A trava de verdade é o UPDATE atômico de lockDelivery.
  const { data: trigger, error: triggerError } = await admin
    .from("rule_triggers")
    .select("*")
    .eq("rule_id", rule.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle<RuleTriggerRow>();
  if (triggerError) throw new Error(`Falha ao ler o disparo da automação: ${triggerError.message}`);
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

  // Conversa assumida por um atendente (D3): também vale para o toque no
  // botão da automação (link do comentário e portão de seguidor).
  if (conversation.takenOver) {
    await logTap("no_match", "[toque em botão da automação]", "Conversa assumida por atendente");
    return;
  }

  // "Pausar automações" vale para os toques também, como na DM e no
  // comentário: nada é entregue e o conteúdo continua esperando.
  if (conversation.pausedUntil) {
    await logTap(
      "no_match",
      "[toque em botão da automação]",
      `Automações pausadas até ${conversation.pausedUntil}`
    );
    return;
  }

  // Um token por evento: cada getFreshToken pode renovar o token na Meta.
  let token: string | null = null;
  const eventToken = async () => (token ??= await getFreshToken(admin, account));

  // Portão "Seguir para liberar": o toque no botão já deu consentimento
  // para a User Profile API (confirmado em produção em 25/09/2026).
  let gateDetail: string | null = null;
  if (isFollowGateOn(rule)) {
    try {
      const gate = await holdUnlessFollowing(admin, account, rule, senderId, await eventToken(), {
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
    const sendToken = await eventToken();
    await sleep(clampDelay(rule.delay_seconds) * 1000);
    await sendRuleReply(sendToken, senderId, rule);
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
  inv: Invocation,
  scope: EventScope,
  igBusinessId: string,
  senderId: string,
  mid: string | undefined,
  payload: string,
  eventTimestampMs: number | undefined
): Promise<void> {
  const { admin, deadline } = inv;

  if (mid && !(await claimEvent(inv, scope, mid))) return;

  const account = await inv.servedAccount(igBusinessId);
  if (!account) return;

  const startedAt = Date.now();

  // Toque no botão também conta como interação para a janela de 24h.
  const conversation = await touchAndReadConversation(admin, account.id, senderId, eventTimestampMs);

  // Conversa assumida por um atendente (D3): o toque num botão de
  // ramificação do workflow também não retoma nada enquanto isso.
  if (conversation.takenOver) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: "[sequência: botão tocado]",
      status: "no_match",
      reply_type: null,
      error_detail: "Conversa assumida por atendente",
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  const outcome = await handleSequencePostback(admin, account, senderId, payload, deadline);
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
  inv: Invocation,
  scope: EventScope,
  igBusinessId: string,
  entryTimeSeconds: number | undefined,
  value: CommentValue
): Promise<void> {
  const commentId = value.id;
  const senderId = value.from?.id;
  const text = value.text;
  const mediaId = value.media?.id;
  if (!commentId || !senderId || !text || !mediaId) return;

  const { admin } = inv;

  // Idempotência: Meta pode reentregar a notificação do mesmo comentário
  if (!(await claimEvent(inv, scope, commentId))) return;

  const recipientId = igBusinessId || "";
  const account = await inv.servedAccount(recipientId);
  if (!account) return;

  // Nunca reage a um comentário feito pela própria conta — evita loop com a
  // resposta pública opcional, que também dispara este mesmo webhook.
  if (senderId === account.ig_user_id) return;

  const startedAt = Date.now();

  // Atendente e "Pausar automações" numa leitura só: a automação de
  // comentário é a porta de entrada dos workflows ligados a ela.
  const conversation = await readConversationGate(admin, account.id, senderId);
  if (conversation.takenOver || conversation.pausedUntil) {
    await admin.from("interactions").insert({
      account_id: account.id,
      ig_sender_id: senderId,
      message_text: text.slice(0, 2000),
      status: "no_match",
      reply_type: null,
      error_detail: conversation.takenOver
        ? "Conversa assumida por atendente"
        : `Automações pausadas até ${conversation.pausedUntil}`,
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  const rules = await loadActiveRules(admin, account.id, "comment");
  const rule = findMatchingCommentRule(text, mediaId, rules);

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
  // Anti-duplicidade: mesma regra nunca dispara 2x para o mesmo usuário. A
  // reserva atômica vem antes da pausa: dois comentários paralelos da mesma
  // pessoa não geram duas respostas privadas.
  if (!(await claimRuleTrigger(admin, rule.id, account.id, senderId))) {
    return { status: "duplicate_skip" };
  }

  // A Meta só aceita resposta privada em até 7 dias após o comentário
  // ("time" do webhook vem em segundos, diferente do "timestamp" de mensagens em ms).
  if (
    entryTimeSeconds &&
    Date.now() - entryTimeSeconds * 1000 > PRIVATE_REPLY_WINDOW_MS
  ) {
    await releaseRuleTrigger(admin, rule.id, senderId);
    return { status: "window_expired" };
  }

  await sleep(clampDelay(rule.delay_seconds) * 1000);
  if (isExpired(rule.expires_at)) {
    await releaseRuleTrigger(admin, rule.id, senderId);
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
    // A resposta privada não saiu: libera a reserva (novo comentário tenta de novo).
    await releaseRuleTrigger(admin, rule.id, senderId);
    await markExpiredOnInvalidToken(admin, account, err);
    return {
      status: "error",
      errorDetail: err instanceof Error ? err.message : String(err),
    };
  }

  return { status: "replied" };
}
