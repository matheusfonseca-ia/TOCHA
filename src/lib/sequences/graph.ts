import {
  buttonHandle,
  OUT_HANDLE,
  QR_FALLBACK_HANDLE,
  quickReplyHandle,
  type ButtonsNodeData,
  type DelayNodeData,
  type DelayUnit,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type SequenceGraph,
  type SequenceGraphNode,
  type TriggerNodeData,
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
      if (!data.anyMessage && !data.keyword.trim()) {
        return "Gatilho: informe a palavra-chave ou marque “qualquer mensagem”.";
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
  }
}

/**
 * Valida o grafo inteiro. Retorna a primeira mensagem de erro (pt-BR) ou
 * null se estiver tudo certo. Usada no editor (toast) e no servidor (action).
 */
export function validateSequenceGraph(graph: SequenceGraph): string | null {
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
    return "Há um bloco solto sem conexão com o fluxo — conecte ou exclua.";
  }

  return null;
}

/** Resumo do gatilho para listas ("preço, link" ou "Qualquer mensagem"). */
export function triggerSummary(graph: SequenceGraph): string {
  const trigger = findTriggerNode(graph);
  if (!trigger) return "—";
  const data = trigger.data as TriggerNodeData;
  return data.anyMessage ? "Qualquer mensagem" : data.keyword;
}
