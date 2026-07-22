import {
  GraphApiError,
  sendImageMessage,
  sendQuickRepliesMessage,
  sendTemplateButtonsMessage,
  sendTextMessage,
  sendTypingAction,
  type TemplateButton,
} from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import { keywordMatches } from "@/lib/rules/engine";
import {
  delayToSeconds,
  findTriggerNode,
  nodeById,
  targetOf,
} from "@/lib/sequences/graph";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/utils";
import type { IgAccount, InteractionStatus } from "@/types/database";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  type ButtonsNodeData,
  type DelayNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type Sequence,
  type SequenceGraph,
  type SequenceGraphNode,
  type SequenceRun,
  type SequenceRunStatus,
  type TriggerNodeData,
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
// Trava de segurança contra ciclos no grafo.
const MAX_TOTAL_STEPS = 100;

// Payload dos botões/quick replies de sequência: instareply:seq:<runId>:<handle>
const SEQ_PAYLOAD_PREFIX = "instareply:seq:";

export function buildSequencePayload(runId: string, handle: string): string {
  return `${SEQ_PAYLOAD_PREFIX}${runId}:${handle}`;
}

export function parseSequencePayload(
  payload: string | undefined | null
): { runId: string; handle: string } | null {
  if (!payload?.startsWith(SEQ_PAYLOAD_PREFIX)) return null;
  const rest = payload.slice(SEQ_PAYLOAD_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  return { runId: rest.slice(0, sep), handle: rest.slice(sep + 1) };
}

type AdminClient = ReturnType<typeof createAdminClient>;

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
 * Tenta iniciar uma sequência a partir de uma DM recebida. Retorna null se
 * nenhum gatilho casou (o pipeline segue para o log de no_match).
 */
export async function maybeStartSequence(
  admin: AdminClient,
  account: IgAccount,
  senderId: string,
  messageText: string
): Promise<SequenceOutcome | null> {
  const { data: sequences } = await admin
    .from("sequences")
    .select("*")
    .eq("account_id", account.id)
    .eq("is_active", true)
    .order("created_at");

  for (const sequence of (sequences ?? []) as Sequence[]) {
    const trigger = findTriggerNode(sequence.graph);
    if (!trigger) continue;
    const data = trigger.data as TriggerNodeData;
    const matched =
      data.anyMessage ||
      keywordMatches(messageText, data.keyword, data.matchType);
    if (!matched) continue;

    // Anti-duplicidade: cada pessoa entra no máximo 1x em cada sequência
    // (unique em (sequence_id, ig_sender_id) — o insert falha na 2ª vez).
    const { data: run, error } = await admin
      .from("sequence_runs")
      .insert({
        sequence_id: sequence.id,
        account_id: account.id,
        ig_sender_id: senderId,
        status: "running",
      })
      .select("*")
      .maybeSingle<SequenceRun>();

    if (error || !run) {
      return {
        status: "duplicate_skip",
        sequenceId: sequence.id,
        sequenceName: sequence.name,
      };
    }

    const startNodeId = targetOf(sequence.graph, trigger.id, OUT_HANDLE);
    return executeFrom(admin, account, sequence, run, startNodeId);
  }

  return null;
}

// ── Retomadas ───────────────────────────────────────────────────────────────

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
  quickReplyPayload: string | undefined
): Promise<SequenceOutcome | null> {
  // 1. Toque em resposta rápida: o payload aponta direto para o run + handle
  const parsed = parseSequencePayload(quickReplyPayload);
  if (parsed) {
    const claimed = await claimRunForSender(
      admin,
      parsed.runId,
      "waiting_reply",
      senderId
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
  if (!waiting || !sequence || !sequence.is_active) return null;

  const node = waiting.current_node_id
    ? nodeById(sequence.graph, waiting.current_node_id)
    : null;
  if (!node) return null;

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
    senderId
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
 *  a checagem entra no próprio UPDATE (nunca trava o run de outra pessoa). */
async function claimRunForSender(
  admin: AdminClient,
  runId: string,
  expectedStatus: SequenceRunStatus,
  senderId: string
): Promise<SequenceRun | null> {
  const { data } = await admin
    .from("sequence_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", expectedStatus)
    .eq("ig_sender_id", senderId)
    .select("*")
    .maybeSingle<SequenceRun>();
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
  // Sequência removida/pausada no meio do fluxo → encerra silenciosamente.
  if (!sequence || !sequence.is_active) {
    await persistRun(admin, run, "completed", {
      last_error: sequence ? "Sequência pausada" : "Sequência removida",
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

  const nextNodeId = targetOf(sequence.graph, node.id, handle);
  return executeFrom(admin, account, sequence, run, nextNodeId);
}

// ── Tick de atrasos (cron + oportunista via webhook) ────────────────────────

/**
 * Retoma execuções paradas em nós de atraso cujo horário venceu. Chamado
 * pela rota de cron e, oportunisticamente, ao fim de cada webhook. Faz o
 * próprio log em `interactions`. Retorna quantos runs processou.
 */
export async function processDueRuns(limit = 5): Promise<number> {
  const admin = createAdminClient();
  const deadline = Date.now() + INVOCATION_BUDGET_MS;

  const { data: due } = await admin
    .from("sequence_runs")
    .select("*, sequences(*)")
    .eq("status", "waiting_delay")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(limit);

  let processed = 0;

  for (const row of (due ?? []) as RunWithSequence[]) {
    if (Date.now() > deadline) break;

    const sequence = row.sequences;
    // Sequência pausada congela os atrasos; removida encerra o run.
    if (!sequence) {
      await persistRun(admin, row, "completed", {
        last_error: "Sequência removida",
      });
      continue;
    }
    if (!sequence.is_active) continue;

    const claimed = await claimRun(admin, row.id, "waiting_delay");
    if (!claimed) continue;

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
    const nextNodeId = node
      ? targetOf(sequence.graph, node.id, OUT_HANDLE)
      : null;

    const startedAt = Date.now();
    const outcome = await executeFrom(
      admin,
      account,
      sequence,
      claimed,
      nextNodeId
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

/** Versão à prova de falha do tick, para rodar ao fim de cada webhook. */
export async function processDueRunsSafe(limit = 3): Promise<void> {
  try {
    await processDueRuns(limit);
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
 */
async function executeFrom(
  admin: AdminClient,
  account: IgAccount,
  sequence: Sequence,
  run: SequenceRun,
  startNodeId: string | null
): Promise<SequenceOutcome> {
  const graph = sequence.graph;
  const invocationStart = Date.now();
  let steps = run.steps_executed;
  let nodeId = startNodeId;
  let token: string | null = null;

  const ok = (status: InteractionStatus): SequenceOutcome => ({
    status,
    sequenceId: sequence.id,
    sequenceName: sequence.name,
  });

  try {
    while (nodeId) {
      if (++steps > MAX_TOTAL_STEPS) {
        throw new Error("Limite de passos da sequência excedido (ciclo no fluxo?)");
      }

      const node = nodeById(graph, nodeId);
      if (!node) {
        throw new Error("Conexão aponta para um bloco que não existe mais");
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
            await sendTextMessage(token, run.ig_sender_id, data.text);
          }
          nodeId = targetOf(graph, node.id, OUT_HANDLE);
          break;
        }

        case "buttons": {
          const data = node.data as ButtonsNodeData;
          token ??= await getFreshToken(admin, account);
          await ensureWindowOpen(admin, account, run.ig_sender_id);
          await humanPause(token, run.ig_sender_id);

          const buttons: TemplateButton[] = data.buttons.map((b, i) =>
            b.kind === "url"
              ? { type: "web_url", title: b.title, url: b.url }
              : {
                  type: "postback",
                  title: b.title,
                  payload: buildSequencePayload(run.id, buttonHandle(i)),
                }
          );
          await sendTemplateButtonsMessage(
            token,
            run.ig_sender_id,
            data.text,
            buttons
          );

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

          await sendQuickRepliesMessage(
            token,
            run.ig_sender_id,
            data.text,
            data.options.map((title, i) => ({
              title,
              payload: buildSequencePayload(run.id, quickReplyHandle(i)),
            }))
          );

          await persistRun(admin, run, "waiting_reply", {
            current_node_id: node.id,
            steps_executed: steps,
          });
          return ok("replied");
        }

        case "delay": {
          const ms = delayToSeconds(node.data as DelayNodeData) * 1000;
          const elapsed = Date.now() - invocationStart;
          if (ms <= INLINE_DELAY_MAX_MS && elapsed + ms < INVOCATION_BUDGET_MS) {
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
      }
    }

    // Sem próximo nó → fim do fluxo.
    await persistRun(admin, run, "completed", { steps_executed: steps });
    return ok("replied");
  } catch (err) {
    if (err instanceof WindowClosedError) {
      await persistRun(admin, run, "window_expired", { steps_executed: steps });
      return ok("window_expired");
    }
    // Token inválido/expirado → marca a conta para reconexão (como nas regras)
    if (err instanceof GraphApiError && err.code === 190) {
      await admin
        .from("ig_accounts")
        .update({ status: "expired" })
        .eq("id", account.id);
    }
    const detail = err instanceof Error ? err.message : String(err);
    await persistRun(admin, run, "error", {
      steps_executed: steps,
      last_error: detail,
    });
    return { ...ok("error"), errorDetail: detail };
  }
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
