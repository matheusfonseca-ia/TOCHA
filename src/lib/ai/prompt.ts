import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";

/**
 * Montagem do prompt do botão ✨. Módulo puro: recebe o campo, o que a pessoa
 * digitou e o contexto da automação, devolve system + user.
 */

export interface FieldPromptContext {
  /** Nome da automação ou do workflow em que o campo vive. */
  ruleName?: string | null;
  /** Palavra-chave que dispara a automação. */
  keyword?: string | null;
  /** @ da conta conectada. */
  accountUsername?: string | null;
}

export interface FieldPromptInput {
  field: AiFieldKind;
  /** Quantas sugestões pedir. */
  count: number;
  /** Ajuste em uma linha digitado por quem clicou ("mais informal"). */
  instruction?: string | null;
  context?: FieldPromptContext;
}

const SYSTEM = [
  "Você escreve microcopy de automação de Instagram em português do Brasil.",
  "Escreve como gente: direto, casual, sem jargão de marketing e sem enrolação.",
  "Nunca usa travessão. Emoji só quando somar, no máximo um por mensagem.",
  "Não inventa preço, prazo, link nem promessa que não esteja no contexto.",
].join(" ");

function contextLines(context: FieldPromptContext | undefined): string[] {
  if (!context) return [];

  const parts = [
    context.ruleName?.trim() && `automação: ${context.ruleName.trim()}`,
    context.keyword?.trim() && `palavra-chave: ${context.keyword.trim()}`,
    context.accountUsername?.trim() && `perfil: @${context.accountUsername.trim()}`,
  ].filter((part): part is string => Boolean(part));

  return parts.length ? [`Contexto: ${parts.join("; ")}.`] : [];
}

export function buildFieldPrompt(input: FieldPromptInput): {
  system: string;
  user: string;
} {
  const spec = aiFieldSpec(input.field);
  const instruction = input.instruction?.trim();

  const lines = [
    `Escreva ${input.count} opções de texto para ${spec.role}.`,
    `Limite rígido: ${spec.maxChars} caracteres por opção.`,
    ...contextLines(input.context),
    ...(instruction ? [`Instrução de quem pediu: ${instruction}.`] : []),
    `Responda só com um array JSON de ${input.count} strings, sem comentário nem numeração.`,
  ];

  return { system: SYSTEM, user: lines.join("\n") };
}
