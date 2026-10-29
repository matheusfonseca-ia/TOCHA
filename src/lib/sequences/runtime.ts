import {
  GraphApiError,
  isTransientGraphError,
  sendImageMessage,
  sendQuickRepliesMessage,
  sendTemplateButtonsMessage,
  sendTextMessage,
  sendTypingAction,
  type TemplateButton,
} from "@/lib/meta/graph";
import { TokenUndecryptableError } from "@/lib/crypto";
import { isExpired, withoutExpired } from "@/lib/expiry/expiry";
import { checkFollow } from "@/lib/follow-gate/check";
import { isFollowGateOn } from "@/lib/follow-gate/copy";
import { sendFollowGateMessage } from "@/lib/follow-gate/gate";
import { accountHasAccess } from "@/lib/billing/access";
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
import { moveLead } from "@/modules/crm/pipeline/server/move-lead";
import { isTakenOver, observeOutbound } from "@/modules/crm/server";
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
  type MoveToStageNodeData,
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
const INLINE_DELAY_MAX_MS = 10 * 1000;
// Orçamento de tempo por invocação. O webhook responde 200 na hora e processa
// em `waitUntil`, que a Cloudflare mantém vivo por ~30s depois da resposta;
// o cron roda no scheduled() com folga parecida. 25s deixa margem para o
// último envio terminar antes do corte (`maxDuration` é da Vercel e não vale
// no Worker).
const INVOCATION_BUDGET_MS = 25 * 1000;
// Folga reservada para executar mais um bloco (pausa humanizada de até 3,5s +
// ida à Graph API). Sem essa folga a execução é estacionada em vez de arriscar
// ser morta no meio do envio.
const NODE_BUDGET_MS = 10 * 1000;
// Um run só fica em `running` durante uma invocação (bem menos de 1 min). Acima disso
// a invocação que o reivindicou morreu (timeout, deploy, crash) e ele é órfão.
const STALE_RUNNING_MS = 5 * 60 * 1000;
// Trava de segurança contra ciclos sem espera numa mesma execução. O save já
// bloqueia esses ciclos (findCyclesWithoutWait); isto cobre grafos legados.
const MAX_STEPS_PER_EXECUTION = 100;
// Teto da vida inteira do run. Ciclos com espera são permitidos (menu que
// volta ao início), então o total cresce a cada volta; o teto só existe para
// um laço com atraso curto não mandar mensagem para sempre. Chegar nele
// encerra o run como concluído (com nota), não como erro.
const MAX_TOTAL_STEPS = 1000;
const MAX_TOTAL_STEPS_NOTE =
  "Encerrado após 1000 passos (limite de segurança de um mesmo run)";
// "Já segui" do portão num nó Automação: cada toque consulta a Graph API
// (2x, com o recheck). Acima deste número de toques no mesmo nó o toque é
// ignorado e o run continua esperando.
const MAX_FOLLOW_RECHECKS_PER_NODE = 10;
// Falha temporária da Meta (limite de taxa, 5xx, timeout) no meio do fluxo:
// o run é reagendado no próprio bloco em vez de morrer como `error`.
const TRANSIENT_RETRY_BACKOFF_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000] as const;
// Run esperando resposta/botão há mais que a janela de 24h da Meta: a pessoa
// já saiu do fluxo; a próxima mensagem dela vai para as regras.
const WAITING_INPUT_TTL_MS = 24 * 60 * 60 * 1000;
const WAITING_INPUT_EXPIRED_NOTE = "Sem resposta em 24h (janela da Meta)";
// Retomadas do tick em paralelo: grupos por pessoa (a mesma pessoa nunca
// recebe dois fluxos intercalados), contas diferentes ao mesmo tempo.
const DUE_RUN_CONCURRENCY = 4;
// Texto para mensagens cujo template ficou vazio (variável não coletada): a
// Meta recusa texto vazio e o fluxo travaria.
const EMPTY_PROMPT_FALLBACK = "Escolha uma opção:";
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
/** Contadores por nó guardados em `sequence_runs.variables`. */
const FOLLOW_CHECKS_KEY = "__followChecks";
const TRANSIENT_RETRIES_KEY = "__retries";
/** Contexto de uma retomada estacionada por falta de orçamento (ver parkRun). */
const RESUME_HINT_KEY = "__resume";

/**
 * Instante em que a invocação precisa devolver o controle. Quem chama a
 * partir de um webhook passa o início da invocação — o processamento do
 * evento já consumiu parte do tempo de `waitUntil`, e contar o orçamento a
 * partir de cada fluxo faria a soma estourar.
 */
export function invocationDeadline(startedAt: number = Date.now()): number {
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
  deadline = invocationDeadline(),
  /** Workflows ativos já carregados (o webhook reaproveita entre as checagens do mesmo evento). */
  preloaded?: Sequence[]
): Promise<SequenceOutcome | null> {
  const sequences = preloaded ?? (await loadActiveSequences(admin, account.id));

  for (const sequence of withoutExpired(sequences)) {
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
 * Workflows ativos da conta, do mais antigo ao mais novo. Erro de leitura
 * lança: tratar como "nenhum workflow" faria a mensagem cair nas regras (ou
 * em no_match) por causa de uma instabilidade do banco.
 */
export async function loadActiveSequences(
  admin: AdminClient,
  accountId: string
): Promise<Sequence[]> {
  const { data, error } = await admin
    .from("sequences")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("created_at");
  if (error) throw new Error(`Falha ao ler os workflows: ${error.message}`);
  return (data ?? []) as Sequence[];
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
/**
 * Exportada também para o Funil (Fase 6): entrar numa etapa com "ao entrar,
 * iniciar workflow" configurado usa exatamente este mesmo caminho (o nó
 * "Mover para etapa" chama por dentro do runtime; o board chama daqui, do
 * server action de mover o card).
 */
export async function startSequenceFromGoTo(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  targetSequenceId: string,
  deadline = invocationDeadline()
): Promise<SequenceOutcome | null> {
  const { data: target, error: targetError } = await admin
    .from("sequences")
    .select("*")
    .eq("id", targetSequenceId)
    .eq("account_id", account.id)
    .eq("is_active", true)
    .maybeSingle<Sequence>();
  if (targetError) throw new Error(`Falha ao ler o workflow de destino: ${targetError.message}`);
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
 * "Ao entrar na etapa, iniciar workflow" (Fase 6): caminho único do board e
 * do nó "Mover para etapa". É um workflow NOVO, então respeita o "Assumir
 * conversa" (D3): com atendente na conversa, não inicia.
 */
export async function startStageEnterSequence(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  sequenceId: string,
  deadline = invocationDeadline()
): Promise<SequenceOutcome | null> {
  if (await isTakenOver(admin, account.id, senderId)) return null;
  return startSequenceFromGoTo(admin, account, senderId, sequenceId, deadline);
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

/** Limite inferior de `updated_at` para um run ainda esperar resposta/botão (N-02). */
function waitingInputCutoff(now = Date.now()): string {
  return new Date(now - WAITING_INPUT_TTL_MS).toISOString();
}

/**
 * Runs esperando resposta/botão há mais de 24h: encerra como window_expired.
 * Sem isso a pessoa que volta semanas depois cai no meio de um fluxo velho
 * (e passa na frente das regras). Chamado no tick e antes de procurar um run
 * para retomar. Best-effort: falha só fica no log.
 */
export async function expireStaleWaitingRuns(
  admin: AdminClient,
  filter: { accountId?: string; senderId?: string } = {}
): Promise<void> {
  let query = admin
    .from("sequence_runs")
    .update({
      status: "window_expired",
      last_error: WAITING_INPUT_EXPIRED_NOTE,
      next_run_at: null,
      updated_at: new Date().toISOString(),
    })
    .in("status", ["waiting_reply", "waiting_postback"])
    .lt("updated_at", waitingInputCutoff());
  if (filter.accountId) query = query.eq("account_id", filter.accountId);
  if (filter.senderId) query = query.eq("ig_sender_id", filter.senderId);
  const { error } = await query;
  if (error) {
    console.warn("[sequences] falha ao expirar runs parados esperando resposta:", error.message);
  }
}

/**
 * Mensagem recebida de alguém que está no meio de um fluxo. Cobre dois casos:
 * toque numa resposta rápida (payload) e resposta livre (nó "esperar
 * resposta" ou fallback das respostas rápidas). Retorna null se não havia
 * fluxo esperando — a mensagem segue o caminho normal (regras).
 *
 * `deadline` é o da invocação do webhook (um orçamento só para o lote todo).
 */
export async function handleSequenceReply(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  quickReplyPayload: string | undefined,
  /** Texto da DM: resposta do nó "Coletar dado". */
  messageText = "",
  deadline = invocationDeadline()
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
    return resumeFromHandle(admin, account, claimed, parsed.handle, "waiting_reply", deadline);
  }

  // 2. Resposta livre: procura um run esperando resposta deste remetente.
  // Run parado há mais de 24h já não conta (N-02): a mensagem segue para as
  // regras e o tick encerra o run como window_expired.
  const { data: waiting, error: waitingError } = await admin
    .from("sequence_runs")
    .select("*, sequences(*)")
    .eq("account_id", account.id)
    .eq("ig_sender_id", senderId)
    .eq("status", "waiting_reply")
    .gte("updated_at", waitingInputCutoff())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RunWithSequence>();
  if (waitingError) {
    throw new Error(`Falha ao procurar fluxo esperando resposta: ${waitingError.message}`);
  }

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
    return handleCollectReply(admin, account, sequence, claimedCollect, node, messageText, deadline);
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
  return resumeFromHandle(admin, account, claimed, handle, "waiting_reply", deadline, sequence);
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
  messageText: string,
  deadline: number
): Promise<SequenceOutcome> {
  const data = node.data as CollectInputNodeData;
  const flow = flowDataFor(admin, account, run);

  try {
    const result = validateInput(data.inputType, messageText);
    if (result.ok) {
      await flow.setAttempts(node.id, null);
      await flow.setField(data.fieldKey, result.value);
      return executeFrom(admin, account, sequence, run, targetOf(sequence.graph, node.id, OUT_HANDLE), { flow, deadline });
    }

    const attempts = flow.attemptsAt(node.id) + 1;
    if (attempts >= data.maxAttempts) {
      await flow.setAttempts(node.id, null);
      return executeFrom(admin, account, sequence, run, targetOf(sequence.graph, node.id, INVALID_HANDLE), { flow, deadline });
    }
    await flow.setAttempts(node.id, attempts);
    return executeFrom(admin, account, sequence, run, node.id, {
      flow,
      deadline,
      resendCollectErrorAt: node.id,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await persistRunSafe(admin, run, "error", { last_error: detail });
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
  payload: string,
  deadline = invocationDeadline()
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
  return resumeFromHandle(admin, account, claimed, parsed.handle, "waiting_postback", deadline);
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
 *  run. Payload v1 (nodeId null) mantém o comportamento antigo. Run parado
 *  há mais de 24h também não casa (N-02). */
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
    .eq("ig_sender_id", senderId)
    .gte("updated_at", waitingInputCutoff());
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
  /** Status em que o run esperava: volta para ele se a leitura do banco falhar. */
  waitingStatus: SequenceRunStatus,
  deadline: number,
  preloadedSequence?: Sequence
): Promise<SequenceOutcome | null> {
  let sequence = preloadedSequence ?? null;
  if (!sequence) {
    const { data, error } = await admin
      .from("sequences")
      .select("*")
      .eq("id", run.sequence_id)
      .maybeSingle<Sequence>();
    if (error) {
      // Instabilidade do banco não é "sequência removida": devolve o run à
      // espera (o próximo toque/resposta tenta de novo) e lança para o
      // webhook registrar a falha.
      await persistRunSafe(admin, run, waitingStatus);
      throw new Error(`Falha ao ler o workflow: ${error.message}`);
    }
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
  // que confere se a pessoa já segue antes de mandar a resposta. Toques
  // demais no mesmo nó (N-11) não consultam mais a Meta: o run segue
  // esperando e o toque só fica registrado.
  if (handle === FOLLOW_CHECK_HANDLE && node.type === "automation") {
    const flow = flowDataFor(admin, account, run);
    const checks = flow.counterAt(FOLLOW_CHECKS_KEY, node.id);
    if (checks >= MAX_FOLLOW_RECHECKS_PER_NODE) {
      await persistRun(admin, run, waitingStatus, {
        current_node_id: node.id,
        steps_executed: run.steps_executed,
      });
      return {
        status: "awaiting_follow",
        sequenceId: sequence.id,
        sequenceName: sequence.name,
        errorDetail: `"Já segui" tocado ${checks} vezes neste bloco: toque ignorado`,
      };
    }
    await flow.setCounter(FOLLOW_CHECKS_KEY, node.id, checks + 1);
    return executeFrom(admin, account, sequence, run, node.id, {
      flow,
      deadline,
      followRecheckAt: node.id,
    });
  }

  const nextNodeId = targetOf(sequence.graph, node.id, handle);
  return executeFrom(admin, account, sequence, run, nextNodeId, { deadline });
}

// ── Tick de atrasos (cron) ──────────────────────────────────────────────────

// Conversa assumida: de quanto em quanto tempo o atraso vencido é conferido de novo.
const TAKEOVER_RECHECK_MS = 15 * 60 * 1000;
/** Assinatura parada: o atraso fica parado (não apaga) e é reconferido de hora em hora. */
const INACTIVE_RECHECK_MS = 60 * 60 * 1000;
/** Falha ao ler a conta no tick: o run volta a esperar e tenta de novo depois disso. */
const ACCOUNT_READ_RETRY_MS = 60 * 1000;

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

/**
 * Retoma execuções paradas em nós de atraso cujo horário venceu. Chamado
 * pela rota de cron (a cada minuto). Faz o próprio log em `interactions`.
 * Retorna quantos runs processou.
 *
 * Runs de pessoas diferentes rodam em paralelo (até DUE_RUN_CONCURRENCY);
 * os da mesma pessoa, em série. Conta e acesso são lidos uma vez por conta
 * no tick. A retomada de um atraso não faz a pausa humanizada antes da 1ª
 * mensagem: a pessoa não está "conversando" naquele instante.
 */
export async function processDueRuns(
  limit = 5,
  deadline = invocationDeadline()
): Promise<number> {
  const admin = createAdminClient();

  await recoverStaleRuns(admin);
  await expireStaleWaitingRuns(admin);

  // Sequência pausada congela os atrasos — mas o filtro precisa acontecer no
  // banco, não no laço: esses runs são os mais antigos da fila, então pulá-los
  // aqui dentro faria com que esgotassem o `limit` a cada tick para sempre e
  // nenhum outro atraso jamais rodasse.
  const { data: due, error: dueError } = await admin
    .from("sequence_runs")
    .select("*, sequences!inner(*)")
    .eq("status", "waiting_delay")
    .eq("sequences.is_active", true)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(limit);
  if (dueError) throw new Error(`Falha ao buscar atrasos vencidos: ${dueError.message}`);

  let processed = 0;
  // Decisões por conta valem só dentro deste tick.
  const inactiveAccounts = new Set<string>();
  const accessByAccount = new Map<string, Promise<boolean>>();
  const accountById = new Map<string, Promise<{ account: IgAccount | null; error: string | null }>>();

  const hasAccess = (accountId: string) => {
    let pending = accessByAccount.get(accountId);
    if (!pending) {
      pending = accountHasAccess(admin, accountId);
      accessByAccount.set(accountId, pending);
    }
    return pending;
  };
  const loadAccount = (accountId: string) => {
    let pending = accountById.get(accountId);
    if (!pending) {
      pending = Promise.resolve(
        admin
          .from("ig_accounts")
          .select("*")
          .eq("id", accountId)
          .eq("status", "active")
          .maybeSingle<IgAccount>()
      ).then(({ data, error }) => ({ account: data ?? null, error: error?.message ?? null }));
      accountById.set(accountId, pending);
    }
    return pending;
  };

  const resumeOne = async (row: RunWithSequence): Promise<void> => {
    if (Date.now() + NODE_BUDGET_MS > deadline) return;

    // Rede de segurança: o `!inner` acima já garante sequência existente
    // (o run é apagado em cascata com ela) e ativa.
    const sequence = row.sequences;
    if (!sequence || !sequence.is_active) return;

    // Conta já vista sem assinatura neste tick: o backlog dela inteiro já foi
    // adiado, os demais runs do lote só são pulados (sem novas consultas).
    if (inactiveAccounts.has(row.account_id)) return;

    // Assinatura parada: o atraso não dispara e nada é apagado. Adia de uma
    // vez TODOS os runs vencidos da conta (a checagem é por conta, não por
    // conversa: um backlog grande ocuparia o `limit` a cada tick e travaria
    // os atrasos das contas pagantes, o mesmo problema das sequências pausadas).
    if (!(await hasAccess(row.account_id))) {
      if (inactiveAccounts.has(row.account_id)) return;
      inactiveAccounts.add(row.account_id);
      const nowIso = new Date().toISOString();
      await admin
        .from("sequence_runs")
        .update({ next_run_at: new Date(Date.now() + INACTIVE_RECHECK_MS).toISOString() })
        .eq("account_id", row.account_id)
        .eq("status", "waiting_delay")
        .lte("next_run_at", nowIso);
      return;
    }

    // Conversa assumida por um atendente (D3): o atraso agendado não
    // dispara enquanto isso. O run não é reivindicado nem marcado como erro:
    // continua `waiting_delay`, com a retomada adiada para sair do topo da
    // fila (senão ocuparia o `limit` a cada tick e nenhum outro atraso
    // rodaria, o mesmo problema das sequências pausadas acima). Depois de
    // "Devolver ao bot", retoma em até TAKEOVER_RECHECK_MS.
    if (await isTakenOver(admin, row.account_id, row.ig_sender_id)) {
      await admin
        .from("sequence_runs")
        .update({ next_run_at: new Date(Date.now() + TAKEOVER_RECHECK_MS).toISOString() })
        .eq("id", row.id)
        .eq("status", "waiting_delay");
      return;
    }

    const claimed = await claimRun(admin, row.id, "waiting_delay");
    if (!claimed) return;

    // Vencido e ainda ativo (sweep não rodou): encerra o run em vez de pular,
    // senão ele ficaria no topo da fila ocupando o `limit` a cada tick.
    if (isExpired(sequence.expires_at)) {
      await persistRun(admin, claimed, "completed", {
        last_error: stoppedReason(sequence),
      });
      return;
    }

    const { account, error: accountError } = await loadAccount(row.account_id);
    if (accountError) {
      // Instabilidade do banco não é "conta desconectada": volta a esperar.
      await persistRunSafe(admin, claimed, "waiting_delay", {
        current_node_id: claimed.current_node_id,
        next_run_at: new Date(Date.now() + ACCOUNT_READ_RETRY_MS).toISOString(),
        last_error: `Falha ao ler a conta: ${accountError}`,
      });
      return;
    }
    if (!account) {
      await persistRun(admin, claimed, "error", {
        last_error: "Conta desconectada",
      });
      return;
    }

    const node = claimed.current_node_id
      ? nodeById(sequence.graph, claimed.current_node_id)
      : null;
    // Parada num nó de atraso: o tempo venceu, segue para o sucessor. Qualquer
    // outro nó é uma parada de orçamento (parkRun) ou de falha temporária —
    // o bloco ainda não foi executado, então a retomada acontece nele mesmo.
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
      { deadline, skipFirstPause: true, ...resumeHintOpts(claimed, nextNodeId) }
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
  };

  // Mesma pessoa (conta + remetente) em série, na ordem da fila.
  const groups = new Map<string, RunWithSequence[]>();
  for (const row of (due ?? []) as RunWithSequence[]) {
    const key = `${row.account_id}:${row.ig_sender_id}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  await forEachConcurrent(Array.from(groups.values()), DUE_RUN_CONCURRENCY, async (rows) => {
    for (const row of rows) {
      try {
        await resumeOne(row);
      } catch (err) {
        console.warn(
          `[sequences] falha ao retomar o run ${row.id}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  });

  return processed;
}

/**
 * Contexto guardado por `parkRun` (reenviar o erro do "Coletar dado" ou
 * conferir de novo o portão): só vale se a retomada for no mesmo bloco.
 */
function resumeHintOpts(
  run: SequenceRun,
  nodeId: string | null
): { resendCollectErrorAt?: string; followRecheckAt?: string } {
  const hint = run.variables?.[RESUME_HINT_KEY] as
    | { nodeId?: string; kind?: "collectError" | "followRecheck" }
    | undefined;
  if (!hint || !nodeId || hint.nodeId !== nodeId) return {};
  if (hint.kind === "collectError") return { resendCollectErrorAt: nodeId };
  if (hint.kind === "followRecheck") return { followRecheckAt: nodeId };
  return {};
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

/** Versão à prova de falha do tick (não lança). */
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
 *
 * CRM: tudo que o fluxo enviar fica gravado como "workflow", inclusive quando
 * ele foi iniciado por uma regra (o contexto mais interno vence).
 */
function executeFrom(
  ...args: Parameters<typeof runNodes>
): Promise<SequenceOutcome> {
  const [, account] = args;
  return observeOutbound({ accountId: account.id, source: "workflow" }, () => runNodes(...args));
}

async function runNodes(
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
    /** Retomada de atraso pelo tick: sem pausa humanizada antes do 1º envio. */
    skipFirstPause?: boolean;
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
  let pauseBeforeNextSend = !opts.skipFirstPause;
  // `last_inbound_at` só muda com mensagem da pessoa, que não chega no meio
  // desta execução: uma leitura basta para todos os blocos.
  let windowChecked = false;

  const ok = (status: InteractionStatus): SequenceOutcome => ({
    status,
    sequenceId: sequence.id,
    sequenceName: sequence.name,
  });

  const prepareSend = async (): Promise<string> => {
    token ??= await getFreshToken(admin, account);
    if (!windowChecked) {
      await ensureWindowOpen(admin, account, run.ig_sender_id);
      windowChecked = true;
    }
    return token;
  };

  const pause = async (currentToken: string): Promise<void> => {
    if (pauseBeforeNextSend) await humanPause(currentToken, run.ig_sender_id);
    pauseBeforeNextSend = true;
  };

  // A retomada já está usando o contexto guardado pelo parkRun: limpa.
  if (flow.internal(RESUME_HINT_KEY) !== undefined) {
    await flow.setInternal(RESUME_HINT_KEY, undefined);
  }

  try {
    while (nodeId) {
      const node = nodeById(graph, nodeId);
      if (!node) {
        throw new Error("Conexão aponta para um bloco que não existe mais");
      }

      // Sem folga para mais um envio, estaciona ANTES de executar o bloco.
      // Sem isso, um fluxo longo (cada envio custa a pausa humanizada + a
      // Graph API) estoura o tempo da invocação e é morto no meio do laço: o
      // catch nunca roda e o run fica preso em `running`.
      if (
        SENDING_NODE_TYPES.has(node.type) &&
        Date.now() + NODE_BUDGET_MS > deadline
      ) {
        await parkRun(admin, flow, run, node.id, steps, opts);
        return ok("replied");
      }

      if (++stepsThisExecution > MAX_STEPS_PER_EXECUTION) {
        throw new Error("Limite de passos da sequência excedido (ciclo no fluxo?)");
      }
      // Teto da vida do run (menu cíclico muito usado): encerra como
      // concluído, com nota, em vez de erro (N-11).
      if (++steps > MAX_TOTAL_STEPS) {
        await persistRun(admin, run, "completed", {
          steps_executed: steps - 1,
          last_error: MAX_TOTAL_STEPS_NOTE,
        });
        return { ...ok("replied"), errorDetail: MAX_TOTAL_STEPS_NOTE };
      }

      switch (node.type) {
        case "trigger": {
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "message": {
          const data = node.data as MessageNodeData;
          if (data.kind === "image") {
            const sendToken = await prepareSend();
            await pause(sendToken);
            await sendImageMessage(sendToken, run.ig_sender_id, data.imageUrl);
            sent = true;
          } else {
            // Template que virou texto vazio (variável não coletada): a Meta
            // recusaria e o fluxo travaria. Sem nada a dizer, segue adiante.
            const text = await flow.render(data.text);
            if (text.trim()) {
              const sendToken = await prepareSend();
              await pause(sendToken);
              await sendTextMessage(sendToken, run.ig_sender_id, text);
              sent = true;
            }
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "buttons": {
          const data = node.data as ButtonsNodeData;
          const sendToken = await prepareSend();
          await pause(sendToken);

          const titles = await flow.renderAll(data.buttons.map((b) => b.title));
          const buttons: TemplateButton[] = data.buttons.map((b, i) => {
            const title = nonEmpty(titles[i], `Opção ${i + 1}`);
            return b.kind === "url"
              ? { type: "web_url", title, url: b.url }
              : {
                  type: "postback",
                  title,
                  payload: buildSequencePayload(run.id, node.id, buttonHandle(i)),
                };
          });
          await sendTemplateButtonsMessage(
            sendToken,
            run.ig_sender_id,
            nonEmpty(await flow.render(data.text), EMPTY_PROMPT_FALLBACK),
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
          const sendToken = await prepareSend();
          await pause(sendToken);

          const optionTitles = await flow.renderAll(data.options);
          await sendQuickRepliesMessage(
            sendToken,
            run.ig_sender_id,
            nonEmpty(await flow.render(data.text), EMPTY_PROMPT_FALLBACK),
            optionTitles.map((title, i) => ({
              title: nonEmpty(title, `Opção ${i + 1}`),
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

          const sendToken = await prepareSend();

          // Portão "Seguir para liberar" da automação vale aqui também: quem
          // não segue recebe o portão e o fluxo espera o "Já segui" neste nó
          // (o botão retoma o próprio run, que confere de novo).
          if (isFollowGateOn(rule)) {
            const again = opts.followRecheckAt === node.id;
            const follow = await checkFollow(sendToken, run.ig_sender_id, { recheck: again });
            if (follow.status === "not_following") {
              await pause(sendToken);
              await sendFollowGateMessage(admin, sendToken, account, rule, run.ig_sender_id, {
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

          await pause(sendToken);
          await sendRuleReply(sendToken, run.ig_sender_id, rule);
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
          const sendToken = await prepareSend();
          await pause(sendToken);
          const question = await flow.render(data.question);
          const text = isRetry
            ? nonEmpty(await flow.render(data.errorText), question)
            : question;
          await sendTextMessage(
            sendToken,
            run.ig_sender_id,
            nonEmpty(text, "Pode me responder por aqui?")
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
          // O destino falhou antes da 1ª mensagem (o run dele é apagado para
          // a pessoa poder entrar de novo): o erro fica visível NESTE run, em
          // vez de ele aparecer como concluído (A1-036).
          if (handoff.status === "error" || handoff.status === "window_expired") {
            const detail =
              handoff.status === "window_expired"
                ? "Ir para workflow: janela de 24h expirada antes do destino começar"
                : `Ir para workflow: o destino falhou (${handoff.errorDetail ?? "erro desconhecido"})`;
            await persistRun(admin, run, handoff.status, {
              steps_executed: steps,
              last_error: detail,
            });
            return handoff;
          }
          await persistRun(admin, run, "completed", { steps_executed: steps });
          return handoff;
        }

        // ── CRM (Fase 6) ────────────────────────────────────────────────
        case "moveToStage": {
          const { stageId } = node.data as MoveToStageNodeData;
          const { data: conversation, error: conversationError } = await admin
            .from("conversations")
            .select("id")
            .eq("account_id", account.id)
            .eq("ig_sender_id", run.ig_sender_id)
            .maybeSingle<{ id: string }>();
          if (conversationError) throw new Error(conversationError.message);
          if (!conversation) {
            throw new Error("Mover para etapa: conversa não encontrada para este contato.");
          }

          // Trava anti-loop: já estar na etapa (inclusive quando este mesmo
          // nó acabou de colocar a pessoa nela) não repete o histórico nem
          // dispara de novo o workflow de entrada. Um segundo disparo do
          // MESMO workflow de entrada some sozinho: `insertRun` já barra a
          // pessoa de entrar duas vezes na mesma sequência.
          const result = await moveLead(admin, {
            accountId: account.id,
            toStageId: stageId,
            source: "automation",
            conversationId: conversation.id,
            igSenderId: run.ig_sender_id,
          });
          if (result.changed && result.targetStage.on_enter_sequence_id) {
            try {
              await startStageEnterSequence(
                admin,
                account,
                run.ig_sender_id,
                result.targetStage.on_enter_sequence_id,
                deadline
              );
            } catch (err) {
              // O workflow "ao entrar" é um bônus da etapa: uma falha nele
              // nunca desfaz o "Mover para etapa" nem quebra este fluxo.
              console.error("[crm] workflow de entrada da etapa falhou:", err instanceof Error ? err.message : err);
            }
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }
      }
    }

    // Sem próximo nó → fim do fluxo.
    await persistRun(admin, run, "completed", { steps_executed: steps });
    return ok("replied");
  } catch (err) {
    // Token inválido/expirado (ou que não decifra com a chave atual) → marca
    // a conta para reconexão (como nas regras)
    if ((err instanceof GraphApiError && err.code === 190) || err instanceof TokenUndecryptableError) {
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
      await persistRunSafe(admin, run, "window_expired", { steps_executed: steps });
      return ok("window_expired");
    }

    // Falha temporária da Meta (limite de taxa, 5xx, timeout): reagenda o
    // próprio bloco com backoff em vez de matar o run, que travaria a pessoa
    // pelo unique (sequence_id, ig_sender_id). Só desiste após algumas tentativas.
    if (nodeId && isTransientGraphError(err)) {
      const retries = flow.counterAt(TRANSIENT_RETRIES_KEY, nodeId);
      const backoff = TRANSIENT_RETRY_BACKOFF_MS[retries];
      if (backoff !== undefined) {
        try {
          await flow.setCounter(TRANSIENT_RETRIES_KEY, nodeId, retries + 1);
          const retryDetail = `${detail} (falha temporária da Meta: nova tentativa em ${Math.round(backoff / 60000)} min)`;
          await persistRun(admin, run, "waiting_delay", {
            current_node_id: nodeId,
            next_run_at: new Date(Date.now() + backoff).toISOString(),
            steps_executed: Math.max(steps - 1, run.steps_executed),
            last_error: retryDetail,
          });
          return { ...ok("error"), errorDetail: retryDetail };
        } catch (persistErr) {
          console.warn(
            "[sequences] falha ao reagendar após erro temporário:",
            persistErr instanceof Error ? persistErr.message : persistErr
          );
        }
      }
    }

    await persistRunSafe(admin, run, "error", {
      steps_executed: steps,
      last_error: detail,
    });
    return { ...ok("error"), errorDetail: detail };
  }
}

/** Texto renderizado vazio (variável não coletada) → alternativa fixa (N-05). */
function nonEmpty(text: string, fallback: string): string {
  return text.trim() ? text : fallback;
}

/**
 * Estaciona a execução num bloco que ainda NÃO foi executado, por falta de
 * orçamento na invocação. Vira `waiting_delay` com vencimento imediato, e a
 * retomada acontece no próprio bloco — `processDueRuns` só pula para o
 * sucessor quando a parada foi num nó de atraso. Retomada que precisava
 * reenviar o erro do "Coletar dado" ou conferir de novo o portão guarda esse
 * contexto em `variables` para o tick repetir o mesmo comportamento.
 */
async function parkRun(
  admin: AdminClient,
  flow: FlowData,
  run: SequenceRun,
  nodeId: string,
  steps: number,
  opts: { resendCollectErrorAt?: string; followRecheckAt?: string }
): Promise<void> {
  const kind =
    opts.resendCollectErrorAt === nodeId
      ? "collectError"
      : opts.followRecheckAt === nodeId
        ? "followRecheck"
        : null;
  if (kind) await flow.setInternal(RESUME_HINT_KEY, { nodeId, kind });
  await persistRun(admin, run, "waiting_delay", {
    current_node_id: nodeId,
    next_run_at: new Date().toISOString(),
    steps_executed: steps,
  });
}

/** Grava a parada do run. Erro de escrita lança: quem chama registra a causa real. */
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
  const { error } = await admin
    .from("sequence_runs")
    .update({
      status,
      // Atraso agendado carrega next_run_at; qualquer outra parada limpa.
      next_run_at: patch.next_run_at ?? null,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", run.id);
  if (error) {
    throw new Error(`Falha ao gravar o estado da execução (${status}): ${error.message}`);
  }
}

/** persistRun que só registra no log (caminhos de erro, onde não há mais a quem lançar). */
async function persistRunSafe(
  ...args: Parameters<typeof persistRun>
): Promise<void> {
  try {
    await persistRun(...args);
  } catch (err) {
    console.error("[sequences]", err instanceof Error ? err.message : err);
  }
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
  const { data, error } = await admin
    .from("conversations")
    .select("last_inbound_at")
    .eq("account_id", account.id)
    .eq("ig_sender_id", senderId)
    .maybeSingle<{ last_inbound_at: string }>();
  if (error) throw new Error(`Falha ao conferir a janela de 24h: ${error.message}`);

  const last = data ? Date.parse(data.last_inbound_at) : NaN;
  if (
    !Number.isFinite(last) ||
    Date.now() - last > WINDOW_24H_MS - WINDOW_MARGIN_MS
  ) {
    throw new WindowClosedError();
  }
}

/**
 * Delay humanizado (2–3,5s) com indicador "digitando..." (best-effort). O
 * typing sai sem esperar resposta: corre junto com a pausa em vez de somar.
 */
async function humanPause(token: string, recipientId: string): Promise<void> {
  void sendTypingAction(token, recipientId).catch(() => {
    // typing é cosmético — nunca derruba o fluxo
  });
  await sleep(2000 + Math.floor(Math.random() * 1500));
}
