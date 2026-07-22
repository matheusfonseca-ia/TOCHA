import type { MatchType } from "./database";

/**
 * Sequências: fluxos de mensagens desenhados no canvas (estilo n8n).
 * O grafo (nós + arestas) é salvo como JSONB em `sequences.graph` no mesmo
 * formato que o React Flow usa no editor — o runtime do webhook percorre
 * esse mesmo JSON, sem etapa de compilação.
 */

export type SequenceNodeType =
  | "trigger"
  | "message"
  | "buttons"
  | "quickReplies"
  | "delay"
  | "waitReply";

/** Handle de saída padrão (nós lineares: gatilho, mensagem, atraso, esperar). */
export const OUT_HANDLE = "out";
/** Handle de saída do botão i de um nó de botões (ramificação). */
export const buttonHandle = (i: number) => `btn-${i}`;
/** Handle de saída da opção i de um nó de respostas rápidas. */
export const quickReplyHandle = (i: number) => `qr-${i}`;
/** Handle seguido quando a pessoa digita algo em vez de tocar numa resposta rápida. */
export const QR_FALLBACK_HANDLE = "qr-fallback";

export interface TriggerNodeData {
  /** true = qualquer DM dispara; false = exige palavra-chave. */
  anyMessage: boolean;
  /** Termos separados por vírgula (OR) — mesmo formato das regras. */
  keyword: string;
  matchType: MatchType;
}

export interface MessageNodeData {
  kind: "text" | "image";
  text: string;
  imageUrl: string;
}

export interface SequenceButton {
  title: string;
  /** url = abre link (web_url); branch = ramifica o fluxo (postback). */
  kind: "url" | "branch";
  url: string;
}

export interface ButtonsNodeData {
  text: string;
  buttons: SequenceButton[];
}

export interface QuickRepliesNodeData {
  text: string;
  /** Título de cada resposta rápida (até 13, 20 caracteres cada). */
  options: string[];
}

export type DelayUnit = "seconds" | "minutes" | "hours";

export interface DelayNodeData {
  amount: number;
  unit: DelayUnit;
}

export type WaitReplyNodeData = Record<string, never>;

export type SequenceNodeData =
  | TriggerNodeData
  | MessageNodeData
  | ButtonsNodeData
  | QuickRepliesNodeData
  | DelayNodeData
  | WaitReplyNodeData;

export interface SequenceGraphNode {
  id: string;
  type: SequenceNodeType;
  position: { x: number; y: number };
  data: SequenceNodeData;
}

export interface SequenceGraphEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
}

export interface SequenceGraph {
  nodes: SequenceGraphNode[];
  edges: SequenceGraphEdge[];
}

export interface Sequence {
  id: string;
  account_id: string;
  name: string;
  graph: SequenceGraph;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SequenceRunStatus =
  | "running"
  | "waiting_reply"
  | "waiting_postback"
  | "waiting_delay"
  | "completed"
  | "window_expired"
  | "error";

export interface SequenceRun {
  id: string;
  sequence_id: string;
  account_id: string;
  ig_sender_id: string;
  status: SequenceRunStatus;
  /** Nó em que o fluxo está parado (esperando resposta/botão/atraso). */
  current_node_id: string | null;
  /** Quando retomar, para status waiting_delay. */
  next_run_at: string | null;
  steps_executed: number;
  last_error: string | null;
  started_at: string;
  updated_at: string;
}
