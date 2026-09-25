import {
  GraphApiError,
  sendImageMessage,
  sendQuickRepliesMessage,
  sendTemplateButtonsMessage,
  sendTextMessage,
  sendTypingAction,
  type TemplateButton,
} from "@/lib/meta/graph";
import { isExpired, withoutExpired } from "@/lib/expiry/expiry";
import { checkFollow } from "@/lib/follow-gate/check";
import { isFollowGateOn } from "@/lib/follow-gate/copy";
import { sendFollowGateMessage } from "@/lib/follow-gate/gate";
import { getFreshToken } from "@/lib/meta/token";
import {
  triggerMatchesInbound,
  type ClassifiedInboundEvent,
} from "@/lib/meta/triggers";
import {
  AUTOMATION_REMOVED_ERROR,
  sendRuleReply,
} from "@/lib/sequences/automation";
import { pauseUntilFromHours } from "@/lib/sequences/automation-pause";
import {
  delayToSeconds,
  entryRuleIdOf,
  findEntryAutomationNode,
  findTriggerNode,
  nodeById,
  targetOf,
} from "@/lib/sequences/graph";
import {
  buildSequencePayload,
  parseSequencePayload,
} from "@/lib/sequences/payload";
import { validateInput } from "@/lib/sequences/collect";
import { FlowData } from "@/lib/sequences/flow-data";
import { fetchAndStoreUsername } from "@/lib/contacts/profile";
import { pickBranch } from "@/lib/sequences/randomizer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, InteractionStatus, Rule } from "@/types/database";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  randomizerHandle,
  type AutomationNodeData,
  type ButtonsNodeData,
  type DelayNodeData,
  type GoToSequenceNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type RandomizerNodeData,
  type Sequence,
  type SequenceGraph,
  type SequenceGraphNode,
  type SequenceNodeType,
  type SequenceRun,
  type SequenceRunStatus,
  type StopAutomationNodeData,
  type TriggerNodeData,
  INVALID_HANDLE,
  NO_HANDLE,
  YES_HANDLE,
  type CollectInputNodeData,
  type ConditionNodeData,
  type SetFieldNodeData,
} from "@/types/sequence";

/**
 * Runtime das sequências: percorre o grafo salvo pelo canvas, enviando as
 * mensagens de cada nó e parando nos nós de espera (resposta, botão, atraso).
 * Cada parada persiste a máquina de estados em `sequence_runs`; os eventos
 * do webhook (mensagem, quick reply, postback) e o tick de atrasos retomam
 * a execução do ponto em que parou.
 */

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
// Margem de segurança antes do fim da janela de 24h da Meta.
const WINDOW_MARGIN_MS = 60 * 1000;
// Atrasos até este teto rodam inline (sleep) na própria invocação do webhook;
// acima disso viram waiting_delay retomado pelo tick.
const INLINE_DELAY_MAX_MS = 20 * 1000;
// Orçamento de tempo por invocação (maxDuration das rotas é 60s).
const INVOCATION_BUDGET_MS = 40 * 1000;
// Folga reservada para executar mais um bloco (pausa humanizada de até 3,5s +
// ida à Graph API). Sem essa folga a execução é estacionada em vez de arriscar
// ser morta no meio do envio.
const NODE_BUDGET_MS = 10 * 1000;
// Um run só fica em `running` durante uma invocação (teto de 60s). Acima disso
// a invocação que o reivindicou morreu (timeout, deploy, crash) e ele é órfão.
const STALE_RUNNING_MS = 5 * 60 * 1000;
// Trava de segurança contra ciclos sem espera numa mesma execução. O save já
// bloqueia esses ciclos (findCyclesWithoutWait); isto cobre grafos legados.
const MAX_STEPS_PER_EXECUTION = 100;
// Teto da vida inteira do run. Ciclos com espera são permitidos (menu que
// volta ao início), então o total cresce a cada volta; o teto só existe para
// um laço com atraso curto não mandar mensagem para sempre.
const MAX_TOTAL_STEPS = 1000;
// Nós que falam com a Graph API — os únicos que custam tempo de verdade.
const SENDING_NODE_TYPES: ReadonlySet<SequenceNodeType> = new Set([
  "message",
  "buttons",
  "quickReplies",
  "automation",
  "collectInput",
]);
// Unique violation do Postgres: a pessoa já passou por esta sequência.
const PG_UNIQUE_VIOLATION = "23505";

// Payload dos botões/quick replies (v1 e v2) vive em ./payload, puro e testado.
export { isSequencePayload, parseSequencePayload } from "@/lib/sequences/payload";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Handle do botão "Já segui" enviado por um nó Automação com portão. */
const FOLLOW_CHECK_HANDLE = "follow-check";

/**
 * Instante em que a invocação precisa devolver o controle. Quem chama a
 * partir de um webhook passa o início da invocação — o processamento do
 * evento já consumiu parte dos 60s de `maxDuration` da rota, e contar o
 * orçamento a partir do tick faria a soma estourar.
 */
export function invocationDeadline(startedAt = Date.now()): number {
  return startedAt + INVOCATION_BUDGET_MS;
}

/** O que o pipeline registra em `interactions` após tratar um evento de sequência. */
export interface SequenceOutcome {
  status: InteractionStatus;
  sequenceId: string;
  sequenceName: string;
  errorDetail?: string;
}

type RunWithSequence = SequenceRun & { sequences: Sequence | null };

class WindowClosedError extends Error {
  constructor() {
    super("Janela de 24h expirada");
  }
}

// ── Entrada no fluxo (gatilho) ──────────────────────────────────────────────

/**
 * Tenta iniciar uma sequência a partir de um evento de entrada classificado
 * (DM, resposta a story, menção em story ou link de referência — ver
 * `classifyInboundEvent` em `lib/meta/triggers.ts`). Retorna null se nenhum
 * gatilho casou (o pipeline segue para o log de no_match).
 */
export async function maybeStartSequence(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  event: ClassifiedInboundEvent,
  deadline = invocationDeadline()
): Promise<SequenceOutcome | null> {
  const { data: sequences } = await admin
    .from("sequences")
    .select("*")
    .eq("account_id", account.id)
    .eq("is_active", true)
    .order("created_at");

  for (const sequence of withoutExpired((sequences ?? []) as Sequence[])) {
    const trigger = findTriggerNode(sequence.graph);
    if (!trigger) continue;
    const data = trigger.data as TriggerNodeData;
    if (!triggerMatchesInbound(data, event)) continue;

    const inserted = await insertRun(admin, account, sequence, senderId, null);
    if ("outcome" in inserted) return inserted.outcome;

    const startNodeId = targetOf(sequence.graph, trigger.id, OUT_HANDLE);
    return executeFrom(admin, account, sequence, inserted.run, startNodeId, {
      discardRunIfNothingSent: true,
      deadline,
    });
  }

  return null;
}

/**
 * Handoff rule → workflow: a rule acabou de entregar a resposta (DM) ou o
 * link (postback do comentário) e o workflow ATIVO que tem essa rule como
 * entrada continua a partir da saída do nó Automação. Workflow pausado ou
 * inexistente → null (a rule respondeu sozinha, sem continuação).
 *
 * Quem chama garante que a janela de 24h está aberta: a DM ou o toque no
 * botão acabaram de atualizar `conversations.last_inbound_at`.
 */
export async function startSequenceFromRule(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  rule: Pick<Rule, "id">,
  deadline = invocationDeadline()
): Promise<SequenceOutcome | null> {
  // Se houver mais de um workflow ativo com a mesma entrada, vale o mais
  // antigo (determinístico). Erro aqui = migration 0002 ainda não aplicada.
  // Sem limit(1): o mais antigo pode estar vencido (expiração) e o seguinte não.
  const { data: candidates, error } = await admin
    .from("sequences")
    .select("*")
    .eq("account_id", account.id)
    .eq("entry_rule_id", rule.id)
    .eq("is_active", true)
    .order("created_at");
  if (error) {
    console.warn("[falow] startSequenceFromRule: falha ao buscar workflow", error.message);
    return null;
  }
  const sequence = withoutExpired((candidates ?? []) as Sequence[])[0];
  if (!sequence) return null;

  // entry_rule_id é espelho do grafo; se divergirem, o grafo manda. A rule
  // pode estar direto no gatilho (source "automation" + ruleId, formato
  // atual) ou num nó Automação ligado a ele (formato legado) — os dois valem.
  if (entryRuleIdOf(sequence.graph) !== rule.id) return null;

  const trigger = findTriggerNode(sequence.graph);
  if (!trigger) return null;
  const triggerData = trigger.data as TriggerNodeData;
  const ruleOnTrigger =
    triggerData.source === "automation" && triggerData.ruleId?.trim() === rule.id;

  let startNodeId: string | null;
  if (ruleOnTrigger) {
    startNodeId = targetOf(sequence.graph, trigger.id, OUT_HANDLE);
    // Workflow legado migrado no editor: o nó Automação antigo da MESMA rule
    // ainda ligado ao gatilho reenviaria a resposta que a rule acabou de mandar.
    const first = startNodeId ? nodeById(sequence.graph, startNodeId) : null;
    if (first?.type === "automation" && (first.data as AutomationNodeData).ruleId === rule.id) {
      startNodeId = targetOf(sequence.graph, first.id, OUT_HANDLE);
    }
  } else {
    const entry = findEntryAutomationNode(sequence.graph);
    if (!entry) return null;
    startNodeId = targetOf(sequence.graph, entry.id, OUT_HANDLE);
  }

  const inserted = await insertRun(admin, account, sequence, senderId, rule.id);
  if ("outcome" in inserted) return inserted.outcome;

  // Aqui o run NÃO é apagado se o 1º envio falhar (diferente da entrada por
  // palavra-chave): a rule já respondeu e gravou rule_triggers, então a
  // pessoa não teria como reentrar. O run fica como `error`, visível no
  // painel de execuções.
  return executeFrom(admin, account, sequence, inserted.run, startNodeId, {
    deadline,
  });
}

/**
 * Nó "Ir para workflow": inicia outro workflow ATIVO da mesma conta para a
 * mesma pessoa, a partir do nó seguinte ao gatilho dele — igual a um gatilho
 * de verdade disparando, só que sem checar o gatilho em si (o "Ir para
 * workflow" já decidiu). Se a pessoa já tiver passado por esse workflow, o
 * unique (sequence_id, ig_sender_id) barra e `insertRun` devolve
 * `duplicate_skip`, registrado normalmente pelo chamador.
 */
async function startSequenceFromGoTo(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  targetSequenceId: string,
  deadline: number
): Promise<SequenceOutcome | null> {
  const { data: target } = await admin
    .from("sequences")
    .select("*")
    .eq("id", targetSequenceId)
    .eq("account_id", account.id)
    .eq("is_active", true)
    .maybeSingle<Sequence>();
  if (!target || !isLive(target)) return null;

  const trigger = findTriggerNode(target.graph);
  if (!trigger) return null;

  const inserted = await insertRun(admin, account, target, senderId, null);
  if ("outcome" in inserted) return inserted.outcome;

  const startNodeId = targetOf(target.graph, trigger.id, OUT_HANDLE);
  return executeFrom(admin, account, target, inserted.run, startNodeId, {
    discardRunIfNothingSent: true,
    deadline,
  });
}

/**
 * Anti-duplicidade: cada pessoa entra no máximo 1x em cada sequência
 * (unique em (sequence_id, ig_sender_id): o insert falha na 2ª vez).
 */
async function insertRun(
  admin: AdminClient,
  account: IgAccount,
  sequence: Sequence,
  senderId: string,
  entryRuleId: string | null
): Promise<{ run: SequenceRun } | { outcome: SequenceOutcome }> {
  const { data: run, error } = await admin
    .from("sequence_runs")
    .insert({
      sequence_id: sequence.id,
      account_id: account.id,
      ig_sender_id: senderId,
      status: "running",
      // Só envia a coluna quando precisa: fluxo por DM segue funcionando
      // mesmo antes da migration 0002.
      ...(entryRuleId ? { entry_rule_id: entryRuleId } : {}),
    })
    .select("*")
    .maybeSingle<SequenceRun>();

  if (run) return { run };

  const base = { sequenceId: sequence.id, sequenceName: sequence.name };
  if (!error || error.code === PG_UNIQUE_VIOLATION) {
    return { outcome: { ...base, status: "duplicate_skip" } };
  }
  return {
    outcome: {
      ...base,
      status: "error",
      errorDetail: `Falha ao iniciar a sequência: ${error.message}`,
    },
  };
}

function flowDataFor(admin: AdminClient, account: IgAccount, run: SequenceRun): FlowData {
  return new FlowData(admin, account.id, run, () =>
    fetchAndStoreUsername(admin, account, run.ig_sender_id)
  );
}

// ── Retomadas ───────────────────────────────────────────────────────────────

/**
 * Pode continuar enviando: ativo e não vencido. O sweep de expiração roda ao
 * fim do webhook e no cron, então um workflow pode estar vencido e ainda com
 * is_active = true; as retomadas não podem depender dele.
 */
function isLive(sequence: Sequence): boolean {
  return sequence.is_active && !isExpired(sequence.expires_at);
}

function stoppedReason(sequence: Sequence | null): string {
  if (!sequence) return "Sequência removida";
  return sequence.is_active ? "Sequência expirada" : "Sequência pausada";
}

/**
 * Mensagem recebida de alguém que está no meio de um fluxo. Cobre dois casos:
 * toque numa resposta rápida (payload) e resposta livre (nó "esperar
 * resposta" ou fallback das respostas rápidas). Retorna null se não havia
 * fluxo esperando — a mensagem segue o caminho normal (regras).
 */
export async function handleSequenceReply(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  quickReplyPayload: string | undefined,
  /** Texto da DM: resposta do nó "Coletar dado". */
  messageText = ""
): Promise<SequenceOutcome | null> {
  // 1. Toque em resposta rápida: o payload aponta direto para o run + handle
  const parsed = parseSequencePayload(quickReplyPayload);
  if (parsed) {
    const claimed = await claimRunForSender(
      admin,
      parsed.runId,
      "waiting_reply",
      senderId,
      parsed.nodeId
    );
    if (!claimed) return null;
    return resumeFromHandle(admin, account, claimed, parsed.handle);
  }

  // 2. Resposta livre: procura um run esperando resposta deste remetente
  const { data: waiting } = await admin
    .from("sequence_runs")
    .select("*, sequences(*)")
    .eq("account_id", account.id)
    .eq("ig_sender_id", senderId)
    .eq("status", "waiting_reply")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RunWithSequence>();

  const sequence = waiting?.sequences;
  if (!waiting || !sequence || !isLive(sequence)) return null;

  const node = waiting.current_node_id
    ? nodeById(sequence.graph, waiting.current_node_id)
    : null;
  if (!node) return null;

  // Coletar dado: o waiting_reply é neste nó (e não num "esperar resposta"),
  // então a resposta é validada e gravada antes de seguir.
  if (node.type === "collectInput") {
    const claimedCollect = await claimRun(admin, waiting.id, "waiting_reply");
    if (!claimedCollect) return null;
    return handleCollectReply(admin, account, sequence, claimedCollect, node, messageText);
  }

  // Nó de respostas rápidas: quem digita em vez de tocar segue o fallback
  // (se conectado); sem fallback, o fluxo continua esperando um toque.
  const handle = node.type === "quickReplies" ? QR_FALLBACK_HANDLE : OUT_HANDLE;
  if (
    node.type === "quickReplies" &&
    !targetOf(sequence.graph, node.id, QR_FALLBACK_HANDLE)
  ) {
    return null;
  }

  const claimed = await claimRun(admin, waiting.id, "waiting_reply");
  if (!claimed) return null;
  return resumeFromHandle(admin, account, claimed, handle, sequence);
}

/**
 * Resposta a um nó "Coletar dado". Válida: grava no contato e nas variáveis
 * e segue por "out". Inválida: reenvia o texto de erro (o próprio nó volta a
 * esperar) até esgotar `maxAttempts`, e então segue por "invalid" (sem
 * ligação, o run termina como completed).
 */
async function handleCollectReply(
  admin: AdminClient,
  account: IgAccount,
  sequence: Sequence,
  run: SequenceRun,
  node: SequenceGraphNode,
  messageText: string
): Promise<SequenceOutcome> {
  const data = node.data as CollectInputNodeData;
  const flow = flowDataFor(admin, account, run);

  try {
    const result = validateInput(data.inputType, messageText);
    if (result.ok) {
      await flow.setAttempts(node.id, null);
      await flow.setField(data.fieldKey, result.value);
      return executeFrom(admin, account, sequence, run, targetOf(sequence.graph, node.id, OUT_HANDLE), { flow });
    }

    const attempts = flow.attemptsAt(node.id) + 1;
    if (attempts >= data.maxAttempts) {
      await flow.setAttempts(node.id, null);
      return executeFrom(admin, account, sequence, run, targetOf(sequence.graph, node.id, INVALID_HANDLE), { flow });
    }
    await flow.setAttempts(node.id, attempts);
    return executeFrom(admin, account, sequence, run, node.id, {
      flow,
      resendCollectErrorAt: node.id,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await persistRun(admin, run, "error", { last_error: detail });
    return {
      status: "error",
      sequenceId: sequence.id,
      sequenceName: sequence.name,
      errorDetail: detail,
    };
  }
}

/** Toque num botão de ramificação (postback) de um nó de botões. */
export async function handleSequencePostback(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  payload: string
): Promise<SequenceOutcome | null> {
  const parsed = parseSequencePayload(payload);
  if (!parsed) return null;

  const claimed = await claimRunForSender(
    admin,
    parsed.runId,
    "waiting_postback",
    senderId,
    parsed.nodeId
  );
  if (!claimed) return null;
  return resumeFromHandle(admin, account, claimed, parsed.handle);
}

/** Marca o run como running (claim atômico — corrida entre webhooks perde aqui). */
async function claimRun(
  admin: AdminClient,
  runId: string,
  expectedStatus: SequenceRunStatus
): Promise<SequenceRun | null> {
  const { data } = await admin
    .from("sequence_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle<SequenceRun>();
  return data ?? null;
}

/** Claim que também exige o remetente esperado — payloads vêm de fora, então
 *  a checagem entra no próprio UPDATE (nunca trava o run de outra pessoa).
 *  Payload v2 traz o nó que enviou o botão: se o run já saiu dele (botão de
 *  uma mensagem antiga), o claim não casa e o toque é ignorado sem mexer no
 *  run. Payload v1 (nodeId null) mantém o comportamento antigo. */
async function claimRunForSender(
  admin: AdminClient,
  runId: string,
  expectedStatus: SequenceRunStatus,
  senderId: string,
  nodeId: string | null
): Promise<SequenceRun | null> {
  let query = admin
    .from("sequence_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", expectedStatus)
    .eq("ig_sender_id", senderId);
  if (nodeId) query = query.eq("current_node_id", nodeId);
  const { data } = await query.select("*").maybeSingle<SequenceRun>();
  return data ?? null;
}

/** Continua a execução a partir da aresta (nó atual, handle). */
async function resumeFromHandle(
  admin: AdminClient,
  account: IgAccount,
  run: SequenceRun,
  handle: string,
  preloadedSequence?: Sequence
): Promise<SequenceOutcome | null> {
  let sequence = preloadedSequence ?? null;
  if (!sequence) {
    const { data } = await admin
      .from("sequences")
      .select("*")
      .eq("id", run.sequence_id)
      .maybeSingle<Sequence>();
    sequence = data;
  }
  // Sequência removida/pausada/vencida no meio do fluxo → encerra silenciosamente.
  if (!sequence || !isLive(sequence)) {
    await persistRun(admin, run, "completed", {
      last_error: stoppedReason(sequence),
    });
    return null;
  }

  const node = run.current_node_id
    ? nodeById(sequence.graph, run.current_node_id)
    : null;
  if (!node) {
    await persistRun(admin, run, "error", {
      last_error: "Nó atual não existe mais no grafo",
    });
    return {
      status: "error",
      sequenceId: sequence.id,
      sequenceName: sequence.name,
      errorDetail: "Nó atual não existe mais no grafo",
    };
  }

  // "Já segui" do portão num nó Automação: executa o próprio nó de novo,
  // que confere se a pessoa já segue antes de mandar a resposta.
  if (handle === FOLLOW_CHECK_HANDLE && node.type === "automation") {
    return executeFrom(admin, account, sequence, run, node.id, {
      followRecheckAt: node.id,
    });
  }

  const nextNodeId = targetOf(sequence.graph, node.id, handle);
  return executeFrom(admin, account, sequence, run, nextNodeId);
}

// ── Tick de atrasos (cron + oportunista via webhook) ────────────────────────

/**
 * Retoma execuções paradas em nós de atraso cujo horário venceu. Chamado
 * pela rota de cron e, oportunisticamente, ao fim de cada webhook. Faz o
 * próprio log em `interactions`. Retorna quantos runs processou.
 */
export async function processDueRuns(
  limit = 5,
  deadline = invocationDeadline()
): Promise<number> {
  const admin = createAdminClient();

  await recoverStaleRuns(admin);

  // Sequência pausada congela os atrasos — mas o filtro precisa acontecer no
  // banco, não no laço: esses runs são os mais antigos da fila, então pulá-los
  // aqui dentro faria com que esgotassem o `limit` a cada tick para sempre e
  // nenhum outro atraso jamais rodasse.
  const { data: due } = await admin
    .from("sequence_runs")
    .select("*, sequences!inner(*)")
    .eq("status", "waiting_delay")
    .eq("sequences.is_active", true)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(limit);

  let processed = 0;

  for (const row of (due ?? []) as RunWithSequence[]) {
    if (Date.now() + NODE_BUDGET_MS > deadline) break;

    // Rede de segurança: o `!inner` acima já garante sequência existente
    // (o run é apagado em cascata com ela) e ativa.
    const sequence = row.sequences;
    if (!sequence || !sequence.is_active) continue;

    const claimed = await claimRun(admin, row.id, "waiting_delay");
    if (!claimed) continue;

    // Vencido e ainda ativo (sweep não rodou): encerra o run em vez de pular,
    // senão ele ficaria no topo da fila ocupando o `limit` a cada tick.
    if (isExpired(sequence.expires_at)) {
      await persistRun(admin, claimed, "completed", {
        last_error: stoppedReason(sequence),
      });
      continue;
    }

    const { data: account } = await admin
      .from("ig_accounts")
      .select("*")
      .eq("id", row.account_id)
      .eq("status", "active")
      .maybeSingle<IgAccount>();

    if (!account) {
      await persistRun(admin, claimed, "error", {
        last_error: "Conta desconectada",
      });
      continue;
    }

    const node = claimed.current_node_id
      ? nodeById(sequence.graph, claimed.current_node_id)
      : null;
    // Parada num nó de atraso: o tempo venceu, segue para o sucessor. Qualquer
    // outro nó é uma parada de orçamento (parkRun) — o bloco ainda não foi
    // executado, então a retomada acontece nele mesmo.
    const nextNodeId = !node
      ? null
      : node.type === "delay"
        ? targetOf(sequence.graph, node.id, OUT_HANDLE)
        : node.id;

    const startedAt = Date.now();
    const outcome = await executeFrom(
      admin,
      account,
      sequence,
      claimed,
      nextNodeId,
      { deadline }
    );
    processed++;

    if (outcome) {
      await admin.from("interactions").insert({
        account_id: account.id,
        ig_sender_id: claimed.ig_sender_id,
        message_text: "[sequência: retomada após atraso]",
        sequence_id: sequence.id,
        matched_keyword: sequence.name,
        status: outcome.status,
        reply_type: null,
        error_detail: outcome.errorDetail ?? null,
        latency_ms: Date.now() - startedAt,
      });
    }
  }

  return processed;
}

/**
 * Runs órfãos em `running`: a invocação que os reivindicou morreu antes de
 * persistir a próxima parada (timeout, deploy no meio, crash). Nenhuma
 * retomada os procura — `processDueRuns` só olha `waiting_delay` e os claims
 * exigem um status de espera — e o unique (sequence_id, ig_sender_id) impede
 * a pessoa de entrar de novo, então ficariam mortos e invisíveis para sempre.
 *
 * Encerramos como `error` em vez de retomar: `current_node_id` aponta para a
 * última parada persistida, que pode estar vários blocos atrás, e retomar de
 * lá reenviaria mensagens que já saíram de verdade para a pessoa.
 */
async function recoverStaleRuns(
  admin: AdminClient,
  limit = 20
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const detail = "Execução interrompida (a invocação anterior não terminou)";

  const { data: stale } = await admin
    .from("sequence_runs")
    .select("*, sequences(name)")
    .eq("status", "running")
    .lt("updated_at", cutoff)
    .order("updated_at")
    .limit(limit);

  type StaleRun = SequenceRun & { sequences: { name: string } | null };

  for (const row of (stale ?? []) as StaleRun[]) {
    // Compare-and-swap no próprio UPDATE: outra invocação (ou o run voltando
    // à vida) perde a corrida e nada é sobrescrito.
    const { data: closed } = await admin
      .from("sequence_runs")
      .update({
        status: "error",
        last_error: detail,
        next_run_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "running")
      .lt("updated_at", cutoff)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (!closed) continue;

    await admin.from("interactions").insert({
      account_id: row.account_id,
      ig_sender_id: row.ig_sender_id,
      message_text: "[sequência: execução interrompida]",
      sequence_id: row.sequence_id,
      matched_keyword: row.sequences?.name ?? null,
      status: "error",
      reply_type: null,
      error_detail: detail,
      latency_ms: null,
    });
  }
}

/** Versão à prova de falha do tick, para rodar ao fim de cada webhook. */
export async function processDueRunsSafe(
  limit = 3,
  deadline = invocationDeadline()
): Promise<void> {
  try {
    await processDueRuns(limit, deadline);
  } catch (err) {
    console.warn(
      "[sequences] falha no tick oportunista:",
      err instanceof Error ? err.message : err
    );
  }
}

// ── Executor ────────────────────────────────────────────────────────────────

/**
 * Percorre o grafo a partir de um nó, executando cada bloco até chegar num
 * nó de espera (persiste e para) ou no fim do fluxo (completed).
 *
 * `deadline` é o instante em que a invocação precisa ter devolvido controle.
 * O tick compartilha um único deadline entre todos os runs que processa — por
 * isso ele é parâmetro, e não recalculado aqui a cada chamada.
 *
 * `discardRunIfNothingSent` (entrada no fluxo): se der erro antes de qualquer
 * mensagem sair, o run é apagado em vez de ficar como `error`. Sem isso o
 * unique (sequence_id, ig_sender_id) impediria a pessoa de entrar de novo por
 * causa de uma falha que ela nem viu.
 */
async function executeFrom(
  admin: AdminClient,
  account: IgAccount,
  sequence: Sequence,
  run: SequenceRun,
  startNodeId: string | null,
  opts: {
    deadline?: number;
    discardRunIfNothingSent?: boolean;
    /** Contexto de dados já carregado (retomada do "Coletar dado"). */
    flow?: FlowData;
    /** Nó "Coletar dado" que deve mandar o texto de erro em vez da pergunta. */
    resendCollectErrorAt?: string;
    /** Nó Automação retomado pelo "Já segui" do portão: confere de novo. */
    followRecheckAt?: string;
  } = {}
): Promise<SequenceOutcome> {
  const graph = sequence.graph;
  const deadline = opts.deadline ?? invocationDeadline();
  const flow = opts.flow ?? flowDataFor(admin, account, run);
  let steps = run.steps_executed;
  let stepsThisExecution = 0;
  let sent = false;
  let nodeId = startNodeId;
  let token: string | null = null;

  const ok = (status: InteractionStatus): SequenceOutcome => ({
    status,
    sequenceId: sequence.id,
    sequenceName: sequence.name,
  });

  try {
    while (nodeId) {
      const node = nodeById(graph, nodeId);
      if (!node) {
        throw new Error("Conexão aponta para um bloco que não existe mais");
      }

      // Sem folga para mais um envio, estaciona ANTES de executar o bloco.
      // Sem isso, um fluxo longo (cada envio custa a pausa humanizada + a
      // Graph API) estoura o maxDuration e é morto no meio do laço: o catch
      // nunca roda e o run fica preso em `running` para sempre.
      if (
        SENDING_NODE_TYPES.has(node.type) &&
        Date.now() + NODE_BUDGET_MS > deadline
      ) {
        await parkRun(admin, run, node.id, steps);
        return ok("replied");
      }

      if (
        ++stepsThisExecution > MAX_STEPS_PER_EXECUTION ||
        ++steps > MAX_TOTAL_STEPS
      ) {
        throw new Error("Limite de passos da sequência excedido (ciclo no fluxo?)");
      }

      switch (node.type) {
        case "trigger": {
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "message": {
          const data = node.data as MessageNodeData;
          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);
          await humanPause(token, run.ig_sender_id);
          if (data.kind === "image") {
            await sendImageMessage(token, run.ig_sender_id, data.imageUrl);
          } else {
            await sendTextMessage(token, run.ig_sender_id, await flow.render(data.text));
          }
          sent = true;
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "buttons": {
          const data = node.data as ButtonsNodeData;
          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);
          await humanPause(token, run.ig_sender_id);

          const titles = await flow.renderAll(data.buttons.map((b) => b.title));
          const buttons: TemplateButton[] = data.buttons.map((b, i) =>
            b.kind === "url"
              ? { type: "web_url", title: titles[i], url: b.url }
              : {
                  type: "postback",
                  title: titles[i],
                  payload: buildSequencePayload(run.id, node.id, buttonHandle(i)),
                }
          );
          await sendTemplateButtonsMessage(
            token,
            run.ig_sender_id,
            await flow.render(data.text),
            buttons
          );
          sent = true;

          const hasBranch = data.buttons.some((b) => b.kind === "branch");
          if (hasBranch) {
            // Espera o toque num botão (messaging_postbacks) para ramificar.
            await persistRun(admin, run, "waiting_postback", {
              current_node_id: node.id,
              steps_executed: steps,
            });
            return ok("replied");
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "quickReplies": {
          const data = node.data as QuickRepliesNodeData;
          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);
          await humanPause(token, run.ig_sender_id);

          const optionTitles = await flow.renderAll(data.options);
          await sendQuickRepliesMessage(
            token,
            run.ig_sender_id,
            await flow.render(data.text),
            optionTitles.map((title, i) => ({
              title,
              payload: buildSequencePayload(run.id, node.id, quickReplyHandle(i)),
            }))
          );
          sent = true;

          await persistRun(admin, run, "waiting_reply", {
            current_node_id: node.id,
            steps_executed: steps,
          });
          return ok("replied");
        }

        case "delay": {
          const ms = delayToSeconds(node.data as DelayNodeData) * 1000;
          if (ms <= INLINE_DELAY_MAX_MS && Date.now() + ms + NODE_BUDGET_MS < deadline) {
            await sleep(ms);
            nodeId = targetOf(graph, node.id, OUT_HANDLE);
          } else {
            await persistRun(admin, run, "waiting_delay", {
              current_node_id: node.id,
              next_run_at: new Date(Date.now() + ms).toISOString(),
              steps_executed: steps,
            });
            return ok("replied");
          }
          break;
        }

        case "waitReply": {
          await persistRun(admin, run, "waiting_reply", {
            current_node_id: node.id,
            steps_executed: steps,
          });
          return ok("replied");
        }

        case "automation": {
          // Referência, não cópia: busca a rule a cada execução, então o
          // fluxo sempre manda a resposta atual dela.
          const { ruleId } = node.data as AutomationNodeData;
          const { data: rule, error: ruleError } = await admin
            .from("rules")
            .select("*")
            .eq("id", ruleId)
            .eq("account_id", account.id)
            .maybeSingle<Rule>();
          if (ruleError) throw new Error(ruleError.message);
          if (!rule) throw new Error(AUTOMATION_REMOVED_ERROR);
          // Comentário só pode ser a entrada (o fluxo começa DEPOIS dele); o
          // save bloqueia, isto cobre um grafo salvo antes da rule mudar.
          if (rule.trigger_type === "comment") {
            throw new Error(
              "Automação de comentário só pode iniciar o fluxo, não ficar no meio dele"
            );
          }

          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);

          // Portão "Seguir para liberar" da automação vale aqui também: quem
          // não segue recebe o portão e o fluxo espera o "Já segui" neste nó
          // (o botão retoma o próprio run, que confere de novo).
          if (isFollowGateOn(rule)) {
            const again = opts.followRecheckAt === node.id;
            const follow = await checkFollow(token, run.ig_sender_id, { recheck: again });
            if (follow.status === "not_following") {
              await humanPause(token, run.ig_sender_id);
              await sendFollowGateMessage(token, account, rule, run.ig_sender_id, {
                again,
                confirmPayload: buildSequencePayload(run.id, node.id, FOLLOW_CHECK_HANDLE),
              });
              sent = true;
              await persistRun(admin, run, "waiting_postback", {
                current_node_id: node.id,
                steps_executed: steps,
              });
              return ok("awaiting_follow");
            }
          }

          await humanPause(token, run.ig_sender_id);
          await sendRuleReply(token, run.ig_sender_id, rule);
          sent = true;
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        // ── Dados do contato ────────────────────────────────────────────
        case "collectInput": {
          // Pergunta (ou, na retomada após resposta inválida, o texto de
          // erro) e espera: a resposta chega por handleSequenceReply.
          const data = node.data as CollectInputNodeData;
          const isRetry = opts.resendCollectErrorAt === node.id;
          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);
          await humanPause(token, run.ig_sender_id);
          await sendTextMessage(
            token,
            run.ig_sender_id,
            await flow.render(isRetry ? data.errorText : data.question)
          );
          sent = true;
          await persistRun(admin, run, "waiting_reply", {
            current_node_id: node.id,
            steps_executed: steps,
          });
          return ok("replied");
        }

        case "condition": {
          const matched = await flow.evaluate(node.data as ConditionNodeData);
          nodeId = targetOf(graph, node.id, matched ? YES_HANDLE : NO_HANDLE);
          break;
        }

        case "setField": {
          const data = node.data as SetFieldNodeData;
          if (data.mode === "tag") {
            await flow.setTag(data.value, data.tagAction ?? "add");
          } else {
            await flow.setField(data.fieldKey, (await flow.render(data.value)).trim());
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        // ── Extras ──────────────────────────────────────────────────────
        case "randomizer": {
          const data = node.data as RandomizerNodeData;
          const branchIndex = pickBranch(data.branches.map((b) => b.weight));
          nodeId = targetOf(graph, node.id, randomizerHandle(branchIndex));
          break;
        }

        case "stopAutomation": {
          const data = node.data as StopAutomationNodeData;
          const pausedUntil = pauseUntilFromHours(data.hours);
          // upsert: cria a linha de conversation se, por algum motivo, ela
          // ainda não existir (nunca deveria acontecer — chegar aqui já
          // implica uma interação anterior que a criou).
          const { error: pauseError } = await admin.from("conversations").upsert(
            {
              account_id: account.id,
              ig_sender_id: run.ig_sender_id,
              automation_paused_until: pausedUntil,
            },
            { onConflict: "account_id,ig_sender_id" }
          );
          if (pauseError) {
            throw new Error(
              `Pausar automações falhou: ${pauseError.message} (aplique a migration 0006_automation_pause.sql)`
            );
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "goToSequence": {
          // Nó terminal: o run atual só é encerrado como concluído se o
          // destino realmente começou; destino pausado, vencido ou removido
          // vira erro visível no painel de execuções.
          const { sequenceId } = node.data as GoToSequenceNodeData;
          const handoff = await startSequenceFromGoTo(
            admin,
            account,
            run.ig_sender_id,
            sequenceId,
            deadline
          );
          if (!handoff) {
            throw new Error(
              "Ir para workflow: o workflow de destino está pausado, vencido ou foi removido"
            );
          }
          await persistRun(admin, run, "completed", { steps_executed: steps });
          return handoff;
        }
      }
    }

    // Sem próximo nó → fim do fluxo.
    await persistRun(admin, run, "completed", { steps_executed: steps });
    return ok("replied");
  } catch (err) {
    // Token inválido/expirado → marca a conta para reconexão (como nas regras)
    if (err instanceof GraphApiError && err.code === 190) {
      await admin
        .from("ig_accounts")
        .update({ status: "expired" })
        .eq("id", account.id);
    }
    const detail = err instanceof Error ? err.message : String(err);

    // Falhou antes da 1ª mensagem sair: apaga o run para a pessoa poder
    // entrar de novo depois (o log em interactions continua registrando).
    if (opts.discardRunIfNothingSent && !sent) {
      await admin.from("sequence_runs").delete().eq("id", run.id);
      return err instanceof WindowClosedError
        ? ok("window_expired")
        : { ...ok("error"), errorDetail: detail };
    }

    if (err instanceof WindowClosedError) {
      await persistRun(admin, run, "window_expired", { steps_executed: steps });
      return ok("window_expired");
    }
    await persistRun(admin, run, "error", {
      steps_executed: steps,
      last_error: detail,
    });
    return { ...ok("error"), errorDetail: detail };
  }
}

/**
 * Estaciona a execução num bloco que ainda NÃO foi executado, por falta de
 * orçamento na invocação. Vira `waiting_delay` com vencimento imediato, e a
 * retomada acontece no próprio bloco — `processDueRuns` só pula para o
 * sucessor quando a parada foi num nó de atraso.
 */
async function parkRun(
  admin: AdminClient,
  run: SequenceRun,
  nodeId: string,
  steps: number
): Promise<void> {
  await persistRun(admin, run, "waiting_delay", {
    current_node_id: nodeId,
    next_run_at: new Date().toISOString(),
    steps_executed: steps,
  });
}

async function persistRun(
  admin: AdminClient,
  run: SequenceRun,
  status: SequenceRunStatus,
  patch: Partial<
    Pick<
      SequenceRun,
      "current_node_id" | "next_run_at" | "steps_executed" | "last_error"
    >
  > = {}
): Promise<void> {
  await admin
    .from("sequence_runs")
    .update({
      status,
      // Atraso agendado carrega next_run_at; qualquer outra parada limpa.
      next_run_at: patch.next_run_at ?? null,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", run.id);
}

/**
 * Janela de 24h da Meta: só podemos enviar se a última mensagem recebida da
 * pessoa foi há menos de 24h. Relevante nas retomadas por atraso — nas
 * retomadas por resposta/botão a pessoa acabou de interagir.
 */
async function ensureWindowOpen(
  admin: AdminClient,
  account: IgAccount,
  senderId: string
): Promise<void> {
  const { data } = await admin
    .from("conversations")
    .select("last_inbound_at")
    .eq("account_id", account.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle<{ last_inbound_at: string }>();

  const last = data ? Date.parse(data.last_inbound_at) : NaN;
  if (
    !Number.isFinite(last) ||
    Date.now() - last > WINDOW_24H_MS - WINDOW_MARGIN_MS
  ) {
    throw new WindowClosedError();
  }
}

/** Delay humanizado (2–3,5s) com indicador "digitando..." (best-effort). */
async function humanPause(token: string, recipientId: string): Promise<void> {
  try {
    await sendTypingAction(token, recipientId);
  } catch {
    // typing é cosmético — nunca derruba o fluxo
  }
  await sleep(2000 + Math.floor(Math.random() * 1500));
}
