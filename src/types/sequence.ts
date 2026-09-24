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
  | "waitReply"
  | "automation"
  // Dados do contato (coletar, condição, definir campo/tag)
  | "collectInput"
  | "condition"
  | "setField"
  // Extras (aleatório, ir para workflow, pausar automações)
  | "randomizer"
  | "goToSequence"
  | "stopAutomation";

/** Handle de saída padrão (nós lineares: gatilho, mensagem, atraso, esperar). */
export const OUT_HANDLE = "out";
/** Handle de saída do botão i de um nó de botões (ramificação). */
export const buttonHandle = (i: number) => `btn-${i}`;
/** Handle de saída da opção i de um nó de respostas rápidas. */
export const quickReplyHandle = (i: number) => `qr-${i}`;
/** Handle seguido quando a pessoa digita algo em vez de tocar numa resposta rápida. */
export const QR_FALLBACK_HANDLE = "qr-fallback";
/** Coletar dado: seguido quando a pessoa esgota as tentativas sem resposta válida. */
export const INVALID_HANDLE = "invalid";
/** Condição: saídas "sim" e "não". */
export const YES_HANDLE = "yes";
export const NO_HANDLE = "no";
/** Handle de saída do caminho i de um nó Aleatório. */
export const randomizerHandle = (i: number) => `rnd-${i}`;

/**
 * Origem do gatilho. "unset" = workflow novo, ainda sem gatilho escolhido no
 * editor (bloqueia salvar/ativar). Ausência do campo (grafos salvos antes
 * deste campo existir) sempre significa "dm" — nunca "unset". "dm" =
 * palavra-chave numa DM (ou qualquer DM, com `anyMessage`). "automation" = o
 * fluxo começa quando uma automação (rule) dispara — a rule pode estar direto
 * no gatilho (`ruleId`) ou num nó Automação ligado a ele (formato legado);
 * anyMessage/keyword são ignorados nesse modo. "storyReply"/"storyMention" =
 * a pessoa respondeu ou marcou a conta num story. "refLink" = a pessoa abriu
 * um link/QR ig.me/m/<usuário>?ref=<código> (ver `refCode`).
 */
export type TriggerSource =
  | "unset"
  | "dm"
  | "automation"
  | "storyReply"
  | "storyMention"
  | "refLink";

export interface TriggerNodeData {
  /** Ausente = "dm" (grafos salvos antes do nó Automação continuam válidos). */
  source?: TriggerSource;
  /** true = qualquer DM dispara; false = exige palavra-chave. Ignorado fora do modo "dm". */
  anyMessage: boolean;
  /** Termos separados por vírgula (OR) — mesmo formato das regras. Opcional
   *  (filtro extra) nos modos "storyReply"/"storyMention"/"refLink". */
  keyword: string;
  matchType: MatchType;
  /** Código do link de referência (ig.me/m/<usuário>?ref=<código>). Só usado
   *  quando source é "refLink" — é o que identifica ESTE gatilho entre vários. */
  refCode?: string;
  /** Automação escolhida direto no gatilho, quando source é "automation".
   *  Ausente = formato legado (a rule está num nó Automação ligado ao gatilho). */
  ruleId?: string;
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

/**
 * Nó "Automação": referência (não cópia) a uma rule existente. Rule de DM
 * pode ficar em qualquer ponto (o runtime envia a resposta atual dela); rule
 * de comentário só como nó de entrada, com o gatilho em source "automation".
 */
export interface AutomationNodeData {
  ruleId: string;
}

// ── Dados do contato ─────────────────────────────────────────────────────────

export type CollectInputType = "text" | "email" | "phone" | "number" | "date";

/**
 * Nó "Coletar dado": pergunta, espera a resposta (run em waiting_reply neste
 * nó), valida pelo tipo e grava em `contacts.fields[fieldKey]` e nas
 * variáveis do run.
 */
export interface CollectInputNodeData {
  question: string;
  fieldKey: string;
  inputType: CollectInputType;
  /** Reenviado a cada resposta inválida, enquanto houver tentativas. */
  errorText: string;
  /** 1 a 5 respostas aceitas antes de seguir pela saída "invalid". */
  maxAttempts: number;
}

export type ConditionOperator =
  | "equals"
  | "contains"
  | "exists"
  | "gt"
  | "lt"
  | "hasTag";

export interface ConditionNodeData {
  /** Ignorado em "hasTag" (a tag vem em `value`). */
  fieldKey: string;
  operator: ConditionOperator;
  value: string;
}

export interface SetFieldNodeData {
  mode: "field" | "tag";
  /** Usado em mode "field". */
  fieldKey: string;
  /** Valor do campo (aceita {{variáveis}}) ou nome da tag. */
  value: string;
  /** Só em mode "tag"; ausente = "add". */
  tagAction?: "add" | "remove";
}

// ── Extras ───────────────────────────────────────────────────────────────────

/** Um caminho do nó "Aleatório": nome e peso (as porcentagens somam 100). */
export interface RandomizerBranch {
  label: string;
  weight: number;
}

/** Nó "Aleatório" (teste A/B): sorteia um de 2 a 5 caminhos por peso. */
export interface RandomizerNodeData {
  branches: RandomizerBranch[];
}

/**
 * Nó "Ir para workflow": encerra o run atual (completed) e inicia outro
 * workflow ativo da mesma conta para a mesma pessoa, a partir do nó seguinte
 * ao gatilho dele.
 */
export interface GoToSequenceNodeData {
  sequenceId: string;
}

/**
 * Nó "Pausar automações": a pessoa para de receber novas regras/workflows
 * por N horas (grava em `conversations.automation_paused_until`). Quem já
 * está no meio de um fluxo continua normalmente.
 */
export interface StopAutomationNodeData {
  hours: number;
}

export type SequenceNodeData =
  | TriggerNodeData
  | MessageNodeData
  | ButtonsNodeData
  | QuickRepliesNodeData
  | DelayNodeData
  | WaitReplyNodeData
  | AutomationNodeData
  | CollectInputNodeData
  | ConditionNodeData
  | SetFieldNodeData
  | RandomizerNodeData
  | GoToSequenceNodeData
  | StopAutomationNodeData;

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
  /**
   * Rule que dá entrada no fluxo (gatilho em source "automation"). Espelho
   * desnormalizado do grafo, gravado pelo save, para o webhook achar rápido
   * "qual workflow continua após a rule X". Migration 0002.
   */
  entry_rule_id?: string | null;
  /** Nulo/ausente = permanente. Migration 0003. */
  expires_at?: string | null;
  expire_action?: "delete" | "pause";
  /** Pausado pelo sweep de expiração, não pelo usuário. Migration 0003. */
  paused_by_expiry?: boolean;
  created_at: string;
  updated_at: string;
}

/** `sequence_runs.variables`: valores coletados + estado interno ("__"). */
export interface RunVariables {
  [key: string]: unknown;
  /** Respostas inválidas já dadas em cada nó "Coletar dado" (nodeId → n). */
  __attempts?: Record<string, number>;
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
  /** Rule que iniciou este run (entrada por automação). Migration 0002. */
  entry_rule_id?: string | null;
  /**
   * Dados coletados neste run (fieldKey → valor) e estado interno dos nós
   * de dados em chaves com prefixo "__" (ex.: `__attempts[nodeId]`).
   * Migration 0004; ausente em bancos sem ela.
   */
  variables?: RunVariables | null;
  started_at: string;
  updated_at: string;
}
