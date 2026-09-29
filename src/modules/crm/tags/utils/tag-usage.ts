import type {
  ConditionNodeData,
  SequenceGraph,
  SetFieldNodeData,
} from "@/types/sequence";

import { normalizeTag } from "./normalize-tag";

export interface SequenceForTagScan {
  id: string;
  name: string;
  graph: SequenceGraph;
}

export interface TagWorkflowUsage {
  count: number;
  sequenceNames: string[];
}

/**
 * Varre os workflows de uma conta procurando nós "Definir campo ou tag" (modo
 * tag) e "Condição" (operador "tem a tag") que usem a tag informada, sem
 * diferenciar maiúscula/acento. Usado para avisar "N workflows usam esta tag"
 * antes de renomear ou excluir.
 */
export function findTagWorkflowUsage(
  sequences: readonly SequenceForTagScan[],
  tagName: string
): TagWorkflowUsage {
  const target = normalizeTag(tagName);
  const matches: string[] = [];

  for (const sequence of sequences) {
    const usesTag = (sequence.graph?.nodes ?? []).some((node) => {
      if (node.type === "setField") {
        const data = node.data as SetFieldNodeData;
        return data.mode === "tag" && normalizeTag(data.value ?? "") === target;
      }
      if (node.type === "condition") {
        const data = node.data as ConditionNodeData;
        return data.operator === "hasTag" && normalizeTag(data.value ?? "") === target;
      }
      return false;
    });
    if (usesTag) matches.push(sequence.name);
  }

  return { count: matches.length, sequenceNames: matches };
}
