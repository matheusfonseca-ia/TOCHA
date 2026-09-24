import { parsePtBrDate, validateNumber } from "@/lib/sequences/collect";
import { ownValue } from "@/lib/sequences/template";
import type { ConditionNodeData } from "@/types/sequence";

/**
 * Avaliação do nó "Condição". Pura: recebe os dados já mesclados do contato
 * (`contacts.fields` com `run.variables` por cima) e as tags do contato.
 */

export interface ConditionSubject {
  fields: Record<string, unknown>;
  tags: readonly string[];
}

/** Comparação de texto sem diferenciar maiúsculas, acentos e espaços nas pontas. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Maior/menor: compara como número quando os dois lados são números ("1.500",
 * "R$ 20"); senão, como data pt-BR ("05/03/1990"). Qualquer outra coisa é
 * falso (não dá para dizer que "abc" é maior que 3).
 */
function compare(left: string, right: string): number | null {
  const date = /^\s*\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\s*$/;
  if (date.test(left) && date.test(right)) {
    const a = parsePtBrDate(left);
    const b = parsePtBrDate(right);
    if (a && b) return a.getTime() - b.getTime();
  }
  const a = validateNumber(left);
  const b = validateNumber(right);
  return a.ok && b.ok ? Number(a.value) - Number(b.value) : null;
}

export function evaluateCondition(
  condition: Pick<ConditionNodeData, "fieldKey" | "operator" | "value">,
  subject: ConditionSubject
): boolean {
  const expected = condition.value ?? "";

  if (condition.operator === "hasTag") {
    const tag = normalize(expected);
    return !!tag && subject.tags.some((t) => normalize(t) === tag);
  }

  const actual = asText(ownValue(subject.fields, condition.fieldKey));

  switch (condition.operator) {
    case "exists":
      return actual.trim() !== "";
    case "equals":
      return normalize(actual) === normalize(expected);
    case "contains":
      return !!normalize(expected) && normalize(actual).includes(normalize(expected));
    case "gt": {
      const diff = compare(actual, expected);
      return diff !== null && diff > 0;
    }
    case "lt": {
      const diff = compare(actual, expected);
      return diff !== null && diff < 0;
    }
    default:
      return false;
  }
}
