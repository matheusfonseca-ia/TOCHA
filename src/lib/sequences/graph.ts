import type { Rule } from "@/types/database";
import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  randomizerHandle,
  type AutomationNodeData,
  type ButtonsNodeData,
  type DelayNodeData,
  type DelayUnit,
  type GoToSequenceNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type RandomizerNodeData,
  type Sequence,
  type SequenceGraph,
  type SequenceGraphNode,
  type StopAutomationNodeData,
  type TriggerNodeData,
  type TriggerSource,
} from "@/types/sequence";

/**
 * Helpers puros sobre o grafo de uma sequência — usados tanto pelo editor
 * (validação antes de salvar) quanto pelo runtime do webhook (travessia).
 */

// ── Limites (espelham os da API da Meta + regras de negócio) ────────────────
export const MAX_NODES = 40;
export const MAX_BUTTONS = 3; // button template aceita 1–3 botões
export const MAX_QUICK_REPLIES = 13; // limite da Meta
export const BUTTON_TITLE_MAX = 20; // trunca acima disso
export const BUTTONS_TEXT_MAX = 640; // texto do button template
export const TEXT_MAX = 1000; // mensagem de texto simples
/** Atraso mínimo/máximo: 5s a 23h (23h para nunca estourar a janela de 24h da Meta). */
export const DELAY_MIN_SECONDS = 5;
export const DELAY_MAX_SECONDS = 23 * 60 * 60;
/** Atraso mínimo para um nó de atraso contar como espera dentro de um ciclo. */
export const CYCLE_DELAY_MIN_SECONDS = 60 * 60;
// Nó "Aleatório": de 2 a 5 caminhos, pesos somando exatamente 100.
export const MIN_RANDOMIZER_BRANCHES = 2;
export const MAX_RANDOMIZER_BRANCHES = 5;
export const RANDOMIZER_WEIGHT_TOTAL = 100;
// Nó "Pausar automações": de 1h a 72h (3 dias).
export const STOP_AUTOMATION_MIN_HOURS = 1;
export const STOP_AUTOMATION_MAX_HOURS = 72;

const DELAY_UNIT_SECONDS: Record<DelayUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
};

export function delayToSeconds(data: DelayNodeData): number {
  return Math.round(data.amount * (DELAY_UNIT_SECONDS[data.unit] ?? 1));
}

export function nodeById(
  graph: SequenceGraph,
  id: string
): SequenceGraphNode | null {
  return graph.nodes.find((n) => n.id === id) ?? null;
}

export function findTriggerNode(graph: SequenceGraph): SequenceGraphNode | null {
  return graph.nodes.find((n) => n.type === "trigger") ?? null;
}

/** Origem do gatilho; grafos anteriores ao nó Automação não têm o campo (= "dm"). */
export function triggerSourceOf(graph: SequenceGraph): TriggerSource {
  const trigger = findTriggerNode(graph);
  return (trigger?.data as TriggerNodeData | undefined)?.source ?? "dm";
}

/**
 * Nó Automação de entrada: o ligado direto ao gatilho quando o gatilho está
 * em source "automation". null em fluxos de gatilho por DM.
 */
export function findEntryAutomationNode(
  graph: SequenceGraph
): SequenceGraphNode | null {
  const trigger = findTriggerNode(graph);
  if (!trigger || triggerSourceOf(graph) !== "automation") return null;
  const firstId = targetOf(graph, trigger.id, OUT_HANDLE);
  const first = firstId ? nodeById(graph, firstId) : null;
  return first?.type === "automation" ? first : null;
}

/**
 * Rule que dá entrada no fluxo, ou null. É o valor que o save grava em
 * `sequences.entry_rule_id` (o webhook busca o workflow por essa coluna).
 * A rule pode estar direto no gatilho (`ruleId`, formato atual — prioridade)
 * ou num nó Automação ligado a ele (`findEntryAutomationNode`, formato legado).
 */
export function entryRuleIdOf(graph: SequenceGraph): string | null {
  const trigger = findTriggerNode(graph);
  const triggerData = trigger?.data as TriggerNodeData | undefined;
  if (triggerData?.source === "automation" && triggerData.ruleId?.trim()) {
    return triggerData.ruleId;
  }
  const entry = findEntryAutomationNode(graph);
  const ruleId = (entry?.data as AutomationNodeData | undefined)?.ruleId;
  return ruleId?.trim() ? ruleId : null;
}

/** Ids (únicos) de todas as rules referenciadas (nós Automação + gatilho por automação). */
export function automationRuleIdsOf(graph: SequenceGraph): string[] {
  const trigger = findTriggerNode(graph);
  const triggerRuleId = (trigger?.data as TriggerNodeData | undefined)?.ruleId;
  const ids = graph.nodes
    .filter((n) => n.type === "automation")
    .map((n) => (n.data as AutomationNodeData).ruleId)
    .filter((id): id is string => !!id?.trim());
  if (triggerRuleId?.trim()) ids.push(triggerRuleId);
  return Array.from(new Set(ids));
}

/** Ids (únicos) das sequências referenciadas por nós "Ir para workflow". */
export function goToSequenceIdsOf(graph: SequenceGraph): string[] {
  const ids = graph.nodes
    .filter((n) => n.type === "goToSequence")
    .map((n) => (n.data as GoToSequenceNodeData).sequenceId)
    .filter((id): id is string => !!id?.trim());
  return Array.from(new Set(ids));
}

/**
 * Nós em que o fluxo para e espera algo de fora (resposta, toque, tempo).
 * Um ciclo que passa por um deles não gira sozinho: cada volta depende da
 * pessoa ou do relógio.
 */
export function isWaitNode(node: SequenceGraphNode): boolean {
  switch (node.type) {
    case "waitReply":
    case "quickReplies":
      return true;
    case "delay":
      // Só atraso longo segura um laço: com 5s de atraso, um ciclo mandaria
      // centenas de mensagens dentro da janela de 24h (risco de bloqueio).
      return delayToSeconds(node.data as DelayNodeData) >= CYCLE_DELAY_MIN_SECONDS;
    case "buttons":
      return (node.data as ButtonsNodeData).buttons.some(
        (b) => b.kind === "branch"
      );
    default:
      return false;
  }
}

/**
 * Ids dos nós que participam de algum ciclo sem nenhum nó de espera (um
 * laço desses dispararia mensagens sem parar). Ciclos com espera são
 * permitidos (menu que volta para o início, por exemplo).
 *
 * Tirando os nós de espera do grafo, todo ciclo que sobra é um ciclo sem
 * espera: basta achar os componentes fortemente conexos (Tarjan) com mais de
 * um nó, ou com laço no próprio nó. Retorna [] se não houver nenhum.
 */
export function findCyclesWithoutWait(graph: SequenceGraph): string[] {
  const candidates = graph.nodes.filter((n) => !isWaitNode(n)).map((n) => n.id);
  const adjacency = new Map<string, string[]>(candidates.map((id) => [id, []]));
  for (const edge of graph.edges) {
    const out = adjacency.get(edge.source);
    if (out && adjacency.has(edge.target)) out.push(edge.target);
  }

  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[] = [];

  const visit = (id: string) => {
    index.set(id, counter);
    low.set(id, counter++);
    stack.push(id);
    onStack.add(id);
  };

  // Iterativo: o grafo é pequeno (MAX_NODES), mas assim nunca estoura a pilha.
  for (const root of candidates) {
    if (index.has(root)) continue;
    visit(root);
    const work: { id: string; next: number }[] = [{ id: root, next: 0 }];

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const neighbors = adjacency.get(frame.id)!;
      if (frame.next < neighbors.length) {
        const w = neighbors[frame.next++];
        if (!index.has(w)) {
          visit(w);
          work.push({ id: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.id, Math.min(low.get(frame.id)!, index.get(w)!));
        }
        continue;
      }

      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
      }
      if (low.get(frame.id) !== index.get(frame.id)) continue;

      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== frame.id);
      const selfLoop =
        component.length === 1 && adjacency.get(frame.id)!.includes(frame.id);
      if (component.length > 1 || selfLoop) result.push(...component);
    }
  }

  return result;
}

/** Nó de destino da aresta que sai de (nodeId, handle) — null se não conectado. */
export function targetOf(
  graph: SequenceGraph,
  nodeId: string,
  handle: string
): string | null {
  const edge = graph.edges.find(
    (e) => e.source === nodeId && (e.sourceHandle ?? OUT_HANDLE) === handle
  );
  return edge?.target ?? null;
}

/** Handles de saída válidos para um nó, conforme o tipo e a configuração. */
export function sourceHandlesOf(node: SequenceGraphNode): string[] {
  switch (node.type) {
    case "buttons": {
      const data = node.data as ButtonsNodeData;
      const branches = data.buttons
        .map((b, i) => (b.kind === "branch" ? buttonHandle(i) : null))
        .filter((h): h is string => h !== null);
      // Sem botões de ramificação, o fluxo continua direto pelo handle padrão.
      return branches.length > 0 ? branches : [OUT_HANDLE];
    }
    case "quickReplies": {
      const data = node.data as QuickRepliesNodeData;
      return [
        ...data.options.map((_, i) => quickReplyHandle(i)),
        QR_FALLBACK_HANDLE,
      ];
    }
    case "randomizer": {
      const data = node.data as RandomizerNodeData;
      return data.branches.map((_, i) => randomizerHandle(i));
    }
    case "goToSequence":
      // Terminal: o run atual encerra aqui e outro workflow assume a pessoa.
      return [];
    default:
      return [OUT_HANDLE];
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateNode(node: SequenceGraphNode): string | null {
  switch (node.type) {
    case "trigger": {
      const data = node.data as TriggerNodeData;
      const source = data.source ?? "dm";
      // Workflow novo, gatilho ainda não escolhido no editor.
      if (source === "unset") return "Defina o gatilho do workflow.";
      // Em source "automation" quem dispara é a rule (no próprio gatilho, via
      // `ruleId`, ou no nó Automação ligado a ele — checado à parte).
      if (source === "automation") return null;
      if (source === "dm" && !data.anyMessage && !data.keyword.trim()) {
        return "Gatilho: informe a palavra-chave ou marque “qualquer mensagem”.";
      }
      // Fora do modo DM a palavra-chave é só um filtro opcional (o próprio
      // tipo de evento já é o sinal): storyReply/storyMention não exigem
      // mais nada, refLink exige o código do link.
      if (source === "refLink" && !data.refCode?.trim()) {
        return "Gatilho: informe o código do link de referência.";
      }
      return null;
    }
    case "message": {
      const data = node.data as MessageNodeData;
      if (data.kind === "image") {
        if (!isValidUrl(data.imageUrl)) {
          return "Mensagem: informe uma URL de imagem válida (https).";
        }
        return null;
      }
      if (!data.text.trim()) return "Mensagem: escreva o texto.";
      if (data.text.length > TEXT_MAX) {
        return `Mensagem: texto acima de ${TEXT_MAX} caracteres.`;
      }
      return null;
    }
    case "buttons": {
      const data = node.data as ButtonsNodeData;
      if (!data.text.trim()) return "Botões: escreva o texto da mensagem.";
      if (data.text.length > BUTTONS_TEXT_MAX) {
        return `Botões: texto acima de ${BUTTONS_TEXT_MAX} caracteres.`;
      }
      if (data.buttons.length < 1 || data.buttons.length > MAX_BUTTONS) {
        return `Botões: use de 1 a ${MAX_BUTTONS} botões.`;
      }
      for (const b of data.buttons) {
        if (!b.title.trim()) return "Botões: todo botão precisa de um título.";
        if (b.kind === "url" && !isValidUrl(b.url)) {
          return `Botões: o botão “${b.title}” precisa de um link válido (https).`;
        }
      }
      return null;
    }
    case "quickReplies": {
      const data = node.data as QuickRepliesNodeData;
      if (!data.text.trim()) return "Respostas rápidas: escreva a pergunta.";
      if (data.text.length > TEXT_MAX) {
        return `Respostas rápidas: texto acima de ${TEXT_MAX} caracteres.`;
      }
      if (data.options.length < 1 || data.options.length > MAX_QUICK_REPLIES) {
        return `Respostas rápidas: use de 1 a ${MAX_QUICK_REPLIES} opções.`;
      }
      if (data.options.some((o) => !o.trim())) {
        return "Respostas rápidas: nenhuma opção pode ficar vazia.";
      }
      return null;
    }
    case "delay": {
      const seconds = delayToSeconds(node.data as DelayNodeData);
      if (!Number.isFinite(seconds) || seconds < DELAY_MIN_SECONDS) {
        return `Atraso: mínimo de ${DELAY_MIN_SECONDS} segundos.`;
      }
      if (seconds > DELAY_MAX_SECONDS) {
        return "Atraso: máximo de 23 horas (limite da janela de 24h da Meta).";
      }
      return null;
    }
    case "waitReply":
      return null;
    case "automation": {
      const data = node.data as AutomationNodeData;
      if (!data.ruleId?.trim()) return "Automação: selecione qual automação usar.";
      return null;
    }
    case "randomizer": {
      const data = node.data as RandomizerNodeData;
      if (
        data.branches.length < MIN_RANDOMIZER_BRANCHES ||
        data.branches.length > MAX_RANDOMIZER_BRANCHES
      ) {
        return `Aleatório: use de ${MIN_RANDOMIZER_BRANCHES} a ${MAX_RANDOMIZER_BRANCHES} caminhos.`;
      }
      if (data.branches.some((b) => !b.label.trim())) {
        return "Aleatório: todo caminho precisa de um nome.";
      }
      if (data.branches.some((b) => !(b.weight > 0))) {
        return "Aleatório: cada caminho precisa de uma porcentagem maior que zero.";
      }
      const total = data.branches.reduce((sum, b) => sum + b.weight, 0);
      if (total !== RANDOMIZER_WEIGHT_TOTAL) {
        return `Aleatório: as porcentagens precisam somar ${RANDOMIZER_WEIGHT_TOTAL}.`;
      }
      return null;
    }
    case "goToSequence": {
      const data = node.data as GoToSequenceNodeData;
      if (!data.sequenceId?.trim()) {
        return "Ir para workflow: escolha o workflow de destino.";
      }
      return null;
    }
    case "stopAutomation": {
      const data = node.data as StopAutomationNodeData;
      if (
        !Number.isFinite(data.hours) ||
        data.hours < STOP_AUTOMATION_MIN_HOURS ||
        data.hours > STOP_AUTOMATION_MAX_HOURS
      ) {
        return `Pausar automações: escolha de ${STOP_AUTOMATION_MIN_HOURS} a ${STOP_AUTOMATION_MAX_HOURS} horas.`;
      }
      return null;
    }
  }
}

/** O que a validação precisa saber de cada rule referenciada por nós Automação. */
export type AutomationRuleRef = Pick<Rule, "id" | "trigger_type" | "account_id">;

/**
 * Contexto opcional da validação. O grafo é puro e não sabe o tipo de cada
 * rule; quem tem acesso ao banco passa o que sabe.
 *
 * Como o save (`saveSequence`) deve passar:
 *   const ids = automationRuleIdsOf(graph);
 *   const { data: refs } = ids.length
 *     ? await supabase.from("rules").select("id, trigger_type, account_id").in("id", ids)
 *     : { data: [] };
 *   validateSequenceGraph(graph, {
 *     accountId: input.account_id,
 *     rulesById: new Map((refs ?? []).map((r) => [r.id, r])),
 *   });
 *
 * Sem `rulesById` (ex.: validação rápida no editor antes de carregar as
 * rules), as checagens que dependem do tipo da rule são puladas. Rule que não
 * está no mapa conta como excluída.
 */
export interface GraphValidationContext {
  rulesById?: Map<string, AutomationRuleRef>;
  /** Conta da sequência: toda rule/workflow referenciado precisa ser dela. */
  accountId?: string;
  /** O que a validação do nó "Ir para workflow" precisa saber de cada workflow alvo. */
  sequencesById?: Map<string, Pick<Sequence, "id" | "account_id">>;
  /** Id da própria sequência sendo validada — barra apontar pra si mesma. */
  selfSequenceId?: string;
}

/**
 * Nó "Ir para workflow": não pode apontar pra própria sequência (loop
 * imediato) e, quando o contexto traz os workflows da conta, o alvo precisa
 * existir e ser da mesma conta. Sem `sequencesById` (ex.: validação rápida
 * no editor antes de carregar a lista), só a checagem de auto-referência roda.
 */
function validateGoToSequenceNodes(
  graph: SequenceGraph,
  ctx: GraphValidationContext
): string | null {
  for (const node of graph.nodes) {
    if (node.type !== "goToSequence") continue;
    const targetId = (node.data as GoToSequenceNodeData).sequenceId?.trim();
    if (!targetId) continue; // já reportado por validateNode

    if (ctx.selfSequenceId && targetId === ctx.selfSequenceId) {
      return "Ir para workflow: não pode apontar para o próprio workflow.";
    }
    if (!ctx.sequencesById) continue;

    const target = ctx.sequencesById.get(targetId);
    if (!target) {
      return "Ir para workflow: o workflow de destino não existe mais.";
    }
    if (ctx.accountId && target.account_id !== ctx.accountId) {
      return "Ir para workflow: o workflow de destino é de outra conta do Instagram.";
    }
  }
  return null;
}

function validateAutomationNodes(
  graph: SequenceGraph,
  trigger: SequenceGraphNode,
  ctx: GraphValidationContext
): string | null {
  const triggerData = trigger.data as TriggerNodeData;
  const source = triggerData.source ?? "dm";
  const triggerRuleId = triggerData.ruleId?.trim() ?? "";
  const firstId = targetOf(graph, trigger.id, OUT_HANDLE);
  const first = firstId ? nodeById(graph, firstId) : null;

  // Duas formas válidas de dar entrada por automação: a rule direto no
  // gatilho (`ruleId`, formato atual) ou num nó Automação ligado a ele
  // (formato legado). Precisa de pelo menos uma.
  if (source === "automation" && !triggerRuleId && first?.type !== "automation") {
    return "Gatilho por automação: escolha a automação no gatilho, ou ligue o gatilho direto a um bloco Automação.";
  }

  if (source === "automation" && triggerRuleId && ctx.rulesById) {
    const rule = ctx.rulesById.get(triggerRuleId);
    if (!rule) {
      return "Automação removida: escolha outra automação no gatilho.";
    }
    if (ctx.accountId && rule.account_id !== ctx.accountId) {
      return "Gatilho: a automação escolhida é de outra conta do Instagram.";
    }
  }

  for (const node of graph.nodes) {
    if (node.type !== "automation" || !ctx.rulesById) continue;
    const ruleId = (node.data as AutomationNodeData).ruleId;
    // Só conta como "entrada" quando o gatilho não já tem a rule direto nele.
    const isEntry = source === "automation" && !triggerRuleId && node.id === first?.id;

    const rule = ctx.rulesById.get(ruleId);
    if (!rule) {
      return "Automação removida: escolha outra automação no bloco ou exclua o bloco.";
    }
    if (ctx.accountId && rule.account_id !== ctx.accountId) {
      return "Automação: a automação escolhida é de outra conta do Instagram.";
    }
    if (rule.trigger_type !== "comment") continue;

    // A Meta só deixa responder um comentário no momento em que ele chega:
    // rule de comentário só faz sentido como porta de entrada do fluxo.
    if (!isEntry) {
      return "Automação de comentário só pode ser o primeiro bloco, ligado ao gatilho (gatilho por automação).";
    }
    if (graph.edges.some((e) => e.target === node.id && e.source !== trigger.id)) {
      return "Nada pode voltar para o bloco de automação de comentário: ele só roda na entrada.";
    }
  }

  return null;
}

/**
 * Valida o grafo inteiro. Retorna a primeira mensagem de erro (pt-BR) ou
 * null se estiver tudo certo. Usada no editor (toast) e no servidor (action).
 */
export function validateSequenceGraph(
  graph: SequenceGraph,
  ctx: GraphValidationContext = {}
): string | null {
  if (graph.nodes.length === 0) return "A sequência está vazia.";
  if (graph.nodes.length > MAX_NODES) {
    return `Máximo de ${MAX_NODES} blocos por sequência.`;
  }

  const triggers = graph.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) {
    return "A sequência precisa de exatamente um bloco de gatilho.";
  }
  const trigger = triggers[0];

  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) {
    return "Blocos com identificador duplicado (recarregue o editor).";
  }

  for (const node of graph.nodes) {
    const error = validateNode(node);
    if (error) return error;
  }

  const seenHandles = new Set<string>();
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    const target = nodeById(graph, edge.target);
    if (!source || !target) return "Há uma conexão apontando para um bloco removido.";
    if (target.id === trigger.id) return "Nada pode apontar para o gatilho.";
    if (edge.source === edge.target) return "Um bloco não pode apontar para si mesmo.";

    const handle = edge.sourceHandle ?? OUT_HANDLE;
    if (!sourceHandlesOf(source).includes(handle)) {
      return "Há uma conexão saindo de um botão/opção que não existe mais.";
    }
    const key = `${edge.source}:${handle}`;
    if (seenHandles.has(key)) {
      return "Cada saída pode ter apenas uma conexão.";
    }
    seenHandles.add(key);
  }

  if (!targetOf(graph, trigger.id, OUT_HANDLE)) {
    return "Conecte o gatilho ao primeiro bloco do fluxo.";
  }

  // Todo bloco precisa ser alcançável a partir do gatilho — bloco solto é
  // quase sempre esquecimento e nunca executaria.
  const reachable = new Set<string>([trigger.id]);
  const queue = [trigger.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.source === current && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  const orphan = graph.nodes.find((n) => !reachable.has(n.id));
  if (orphan) {
    return "Há um bloco solto sem conexão com o fluxo. Conecte ou exclua.";
  }

  const automationError = validateAutomationNodes(graph, trigger, ctx);
  if (automationError) return automationError;

  const goToSequenceError = validateGoToSequenceNodes(graph, ctx);
  if (goToSequenceError) return goToSequenceError;

  // Ciclo com espera (resposta, botão, atraso) é permitido; sem espera ele
  // dispararia mensagens em laço. O editor destaca os nós com
  // findCyclesWithoutWait.
  if (findCyclesWithoutWait(graph).length > 0) {
    return "Há um ciclo sem nenhum bloco de espera (esperar resposta, botões com ramificação, respostas rápidas ou atraso de 1 hora ou mais). Inclua uma espera no caminho de volta.";
  }

  return null;
}

/** Resumo do gatilho para listas ("preço, link", "Qualquer mensagem" ou por automação). */
export function triggerSummary(graph: SequenceGraph): string {
  const trigger = findTriggerNode(graph);
  if (!trigger) return "Sem gatilho";
  const data = trigger.data as TriggerNodeData;
  switch (data.source) {
    case "unset":
      return "Gatilho não definido";
    case "automation":
      return "Quando uma automação disparar";
    case "storyReply":
      return data.keyword.trim() ? `Resposta a story com “${data.keyword}”` : "Resposta a qualquer story";
    case "storyMention":
      return "Menção em story";
    case "refLink":
      return data.refCode?.trim() ? `Link de referência (${data.refCode})` : "Link de referência";
    default:
      return data.anyMessage ? "Qualquer mensagem" : data.keyword;
  }
}
