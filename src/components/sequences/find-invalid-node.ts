import {
  BUTTONS_TEXT_MAX,
  DELAY_MAX_SECONDS,
  DELAY_MIN_SECONDS,
  MAX_BUTTONS,
  MAX_QUICK_REPLIES,
  TEXT_MAX,
  delayToSeconds,
  findTriggerNode,
  nodeById,
  sourceHandlesOf,
  targetOf,
} from "@/lib/sequences/graph";
import {
  OUT_HANDLE,
  type ButtonsNodeData,
  type DelayNodeData,
  type MessageNodeData,
  type QuickRepliesNodeData,
  type SequenceGraph,
  type SequenceGraphNode,
  type TriggerNodeData,
} from "@/types/sequence";

/**
 * Deriva QUAL bloco causou o erro que `validateSequenceGraph` devolve como
 * string (sem essa informação) — usado só pra destacar a borda do bloco no
 * canvas e dar fitView nele. Fica separado de `src/lib/sequences/graph.ts`
 * (dono de outro agente): replica a MESMA ordem de checagem da validação
 * "de verdade", então o primeiro bloco encontrado aqui costuma ser o mesmo
 * que gerou a mensagem do toast. Pior caso, se o grafo mudar de um jeito
 * incompatível com essa cópia: não destaca nada, o toast genérico continua
 * valendo (a validação que bloqueia o salvamento é sempre a de graph.ts).
 */

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function nodeHasContentError(node: SequenceGraphNode): boolean {
  switch (node.type) {
    case "trigger": {
      const data = node.data as TriggerNodeData;
      return !data.anyMessage && !data.keyword.trim();
    }
    case "message": {
      const data = node.data as MessageNodeData;
      if (data.kind === "image") return !isValidUrl(data.imageUrl);
      return !data.text.trim() || data.text.length > TEXT_MAX;
    }
    case "buttons": {
      const data = node.data as ButtonsNodeData;
      if (!data.text.trim() || data.text.length > BUTTONS_TEXT_MAX) return true;
      if (data.buttons.length < 1 || data.buttons.length > MAX_BUTTONS) return true;
      return data.buttons.some(
        (b) => !b.title.trim() || (b.kind === "url" && !isValidUrl(b.url))
      );
    }
    case "quickReplies": {
      const data = node.data as QuickRepliesNodeData;
      if (!data.text.trim() || data.text.length > TEXT_MAX) return true;
      if (data.options.length < 1 || data.options.length > MAX_QUICK_REPLIES) return true;
      return data.options.some((o) => !o.trim());
    }
    case "delay": {
      const seconds = delayToSeconds(node.data as DelayNodeData);
      return (
        !Number.isFinite(seconds) ||
        seconds < DELAY_MIN_SECONDS ||
        seconds > DELAY_MAX_SECONDS
      );
    }
    case "waitReply":
      return false;
    case "automation":
      // Validação de conteúdo (rule existe/ativa/mesma conta) é do dono do
      // nó "automation" em graph.ts — aqui só evita quebrar a exaustão do
      // switch; não sinaliza erro de conteúdo por conta própria.
      return false;
  }
}

export function findFirstInvalidNode(graph: SequenceGraph): string | null {
  // 1) Conteúdo do próprio bloco — mesma ordem de `validateNode` em graph.ts.
  const badContent = graph.nodes.find(nodeHasContentError);
  if (badContent) return badContent.id;

  const trigger = findTriggerNode(graph);
  if (!trigger) return null;

  // 2) Gatilho sem o primeiro bloco do fluxo conectado.
  if (!targetOf(graph, trigger.id, OUT_HANDLE)) return trigger.id;

  // 3) Conexão inválida: aponta pra si mesmo, handle que não existe mais,
  //    ou saída com mais de uma conexão — destaca quem originou a aresta.
  const seenHandles = new Set<string>();
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    if (!source) continue;
    if (edge.source === edge.target) return source.id;
    const handle = edge.sourceHandle ?? OUT_HANDLE;
    if (!sourceHandlesOf(source).includes(handle)) return source.id;
    const key = `${edge.source}:${handle}`;
    if (seenHandles.has(key)) return source.id;
    seenHandles.add(key);
  }

  // 4) Bloco solto, sem caminho a partir do gatilho.
  const reachable = new Set<string>([trigger.id]);
  const queue = [trigger.id];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.source === currentId && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  const orphan = graph.nodes.find((n) => !reachable.has(n.id));
  if (orphan) return orphan.id;

  return null;
}
