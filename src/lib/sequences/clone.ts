import type { SequenceGraph } from "@/types/sequence";

/**
 * Gera um novo id de nó com a mesma convenção do editor
 * (`sequence-editor.tsx` → `newNodeId`): `${type}-${random}`.
 */
function newNodeId(type: string): string {
  return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function newEdgeId(): string {
  return `edge-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Clona um grafo de sequência com ids novos para todos os nós e arestas,
 * sem mutar o grafo original. Usado por `duplicateSequence` para criar uma
 * cópia independente: se o original for editado depois, a cópia não muda
 * (e vice-versa), diferente de uma referência ao mesmo id.
 *
 * `sourceHandle` das arestas não muda: é o handle do nó de origem (ex.:
 * `btn-0`, `qr-1`), continua válido porque o nó de origem mantém o mesmo
 * `type`/configuração, só o id troca.
 */
export function cloneGraphWithFreshIds(graph: SequenceGraph): SequenceGraph {
  const idMap = new Map<string, string>();
  for (const node of graph.nodes) {
    idMap.set(node.id, newNodeId(node.type));
  }

  const nodes = graph.nodes.map((node) => ({
    id: idMap.get(node.id)!,
    type: node.type,
    position: { ...node.position },
    data: structuredClone(node.data),
  }));

  const edges = graph.edges.map((edge) => ({
    id: newEdgeId(),
    source: idMap.get(edge.source) ?? edge.source,
    sourceHandle: edge.sourceHandle,
    target: idMap.get(edge.target) ?? edge.target,
  }));

  return { nodes, edges };
}
