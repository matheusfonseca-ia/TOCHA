import type {
  CollectInputNodeData,
  CollectInputType,
  ConditionNodeData,
  ConditionOperator,
  SetFieldNodeData,
} from "@/types/sequence";

/** Textos dos nós de dados compartilhados entre cards do canvas e formulários. */

export const INPUT_TYPE_OPTIONS: {
  value: CollectInputType;
  label: string;
  /** Rótulo no resumo do card: "Coletar e-mail em {email}". */
  noun: string;
  suggestedKey: string;
  defaultError: string;
}[] = [
  {
    value: "text",
    label: "Texto livre",
    noun: "resposta",
    suggestedKey: "resposta",
    defaultError: "Não entendi. Pode escrever de novo?",
  },
  {
    value: "email",
    label: "E-mail",
    noun: "e-mail",
    suggestedKey: "email",
    defaultError: "Esse e-mail não parece válido. Pode conferir e mandar de novo?",
  },
  {
    value: "phone",
    label: "Telefone",
    noun: "telefone",
    suggestedKey: "telefone",
    defaultError: "Não reconheci o número. Manda com DDD, por exemplo (11) 98765-4321.",
  },
  {
    value: "number",
    label: "Número",
    noun: "número",
    suggestedKey: "numero",
    defaultError: "Preciso só do número. Pode mandar de novo?",
  },
  {
    value: "date",
    label: "Data",
    noun: "data",
    suggestedKey: "data",
    defaultError: "Não entendi a data. Manda no formato dia/mês/ano, por exemplo 05/03/1990.",
  },
];

export function inputTypeOption(type: CollectInputType) {
  return INPUT_TYPE_OPTIONS.find((o) => o.value === type) ?? INPUT_TYPE_OPTIONS[0];
}

export const OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "é igual a" },
  { value: "contains", label: "contém" },
  { value: "exists", label: "foi preenchido" },
  { value: "gt", label: "é maior que" },
  { value: "lt", label: "é menor que" },
  { value: "hasTag", label: "tem a tag" },
];

export function operatorLabel(op: ConditionOperator): string {
  return OPERATOR_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

export function defaultCollectInputData(): CollectInputNodeData {
  const text = inputTypeOption("text");
  return {
    question: "",
    fieldKey: "",
    inputType: "text",
    errorText: text.defaultError,
    maxAttempts: 2,
  };
}

export function defaultConditionData(): ConditionNodeData {
  return { fieldKey: "", operator: "equals", value: "" };
}

export function defaultSetFieldData(): SetFieldNodeData {
  return { mode: "field", fieldKey: "", value: "", tagAction: "add" };
}
