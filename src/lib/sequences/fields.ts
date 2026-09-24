import {
  COLLECT_MAX_ATTEMPTS,
  COLLECT_MIN_ATTEMPTS,
} from "@/lib/sequences/collect";
import {
  NO_HANDLE,
  YES_HANDLE,
  type CollectInputNodeData,
  type ConditionNodeData,
  type SequenceGraph,
  type SequenceGraphNode,
  type SetFieldNodeData,
} from "@/types/sequence";

/**
 * Regras dos nós de dados (Coletar dado, Condição, Definir campo ou tag)
 * compartilhadas pela validação do grafo (graph.ts), pelo destaque do bloco
 * inválido no editor e pelos formulários.
 */

/**
 * Nome de campo: minúsculas, números e "_", até 40. Não pode começar com "_"
 * porque chaves "__" são estado interno do run (`variables.__attempts`).
 */
export const FIELD_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,39}$/;
export const FIELD_KEY_MAX = 40;
export const COLLECT_QUESTION_MAX = 1000;
export const COLLECT_ERROR_MAX = 640;
export const FIELD_VALUE_MAX = 500;
export const TAG_MAX = 40;

export function isValidFieldKey(key: string): boolean {
  return FIELD_KEY_PATTERN.test(key);
}

/** Sugestão de nome de campo a partir do que a pessoa digitou ("E-mail" → "e_mail"). */
export function toFieldKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, FIELD_KEY_MAX);
}

const FIELD_KEY_HINT =
  "use letras minúsculas, números e _ (até 40), começando por letra ou número";

/** Erro de conteúdo de um nó de dados, ou null (nós de outros tipos: null). */
export function dataNodeError(node: SequenceGraphNode): string | null {
  switch (node.type) {
    case "collectInput": {
      const data = node.data as CollectInputNodeData;
      if (!data.question?.trim()) return "Coletar dado: escreva a pergunta.";
      if (data.question.length > COLLECT_QUESTION_MAX) {
        return `Coletar dado: pergunta acima de ${COLLECT_QUESTION_MAX} caracteres.`;
      }
      if (!isValidFieldKey(data.fieldKey ?? "")) {
        return `Coletar dado: nome do campo inválido, ${FIELD_KEY_HINT}.`;
      }
      if (
        !Number.isInteger(data.maxAttempts) ||
        data.maxAttempts < COLLECT_MIN_ATTEMPTS ||
        data.maxAttempts > COLLECT_MAX_ATTEMPTS
      ) {
        return `Coletar dado: tentativas entre ${COLLECT_MIN_ATTEMPTS} e ${COLLECT_MAX_ATTEMPTS}.`;
      }
      if (data.maxAttempts > 1 && !data.errorText?.trim()) {
        return "Coletar dado: escreva a mensagem para resposta inválida.";
      }
      if ((data.errorText ?? "").length > COLLECT_ERROR_MAX) {
        return `Coletar dado: mensagem de erro acima de ${COLLECT_ERROR_MAX} caracteres.`;
      }
      return null;
    }
    case "condition": {
      const data = node.data as ConditionNodeData;
      if (data.operator === "hasTag") {
        return data.value?.trim() ? null : "Condição: informe a tag.";
      }
      if (!isValidFieldKey(data.fieldKey ?? "")) {
        return `Condição: nome do campo inválido, ${FIELD_KEY_HINT}.`;
      }
      if (data.operator !== "exists" && !data.value?.trim()) {
        return "Condição: informe o valor para comparar.";
      }
      return null;
    }
    case "setField": {
      const data = node.data as SetFieldNodeData;
      if (data.mode === "tag") {
        if (!data.value?.trim()) return "Definir campo: informe a tag.";
        if (data.value.length > TAG_MAX) {
          return `Definir campo: tag acima de ${TAG_MAX} caracteres.`;
        }
        return null;
      }
      if (!isValidFieldKey(data.fieldKey ?? "")) {
        return `Definir campo: nome do campo inválido, ${FIELD_KEY_HINT}.`;
      }
      if ((data.value ?? "").length > FIELD_VALUE_MAX) {
        return `Definir campo: valor acima de ${FIELD_VALUE_MAX} caracteres.`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Avisos que não bloqueiam o salvamento: condição com "sim" ou "não" sem
 * ligação (o fluxo simplesmente termina por aquele lado).
 */
export function dataNodesWarning(graph: SequenceGraph): string | null {
  for (const node of graph.nodes) {
    if (node.type !== "condition") continue;
    const connected = (handle: string) =>
      graph.edges.some((e) => e.source === node.id && e.sourceHandle === handle);
    const missing = [
      !connected(YES_HANDLE) && "“sim”",
      !connected(NO_HANDLE) && "“não”",
    ].filter(Boolean);
    if (missing.length > 0) {
      return `Condição sem ligação na saída ${missing.join(" e ")}: por esse caminho o fluxo termina.`;
    }
  }
  return null;
}

/** Campos que o fluxo grava (Coletar dado e Definir campo), para sugestões no editor. */
export function fieldKeysOf(graph: SequenceGraph): string[] {
  const keys = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type === "collectInput") {
      keys.add((node.data as CollectInputNodeData).fieldKey);
    } else if (node.type === "setField") {
      const data = node.data as SetFieldNodeData;
      if (data.mode === "field") keys.add(data.fieldKey);
    }
  }
  return Array.from(keys).filter(isValidFieldKey).sort();
}
