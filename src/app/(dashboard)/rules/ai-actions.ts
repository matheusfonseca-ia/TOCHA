"use server";

import type { AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { aiConfigFromEnv, generateFieldSuggestions } from "@/lib/ai/provider";

/**
 * Botão ✨ dos campos de texto. A chave da IA nunca sai do servidor: o
 * cliente manda só o campo, a instrução e o contexto, e recebe as sugestões
 * prontas.
 *
 * Sem `OPENROUTER_API_KEY` configurada, `isAiEnabled` devolve false e a UI
 * nem mostra o botão.
 */

export async function isAiEnabled(): Promise<boolean> {
  return aiConfigFromEnv() !== null;
}

export type GenerateResult = { suggestions: string[] } | { error: string };

export async function generateForField(input: {
  field: AiFieldKind;
  count?: number;
  instruction?: string | null;
  context?: FieldPromptContext;
}): Promise<GenerateResult> {
  const config = aiConfigFromEnv();
  if (!config) {
    return {
      error:
        "IA não configurada nesta instalação. Preencha OPENROUTER_API_KEY no .env.local.",
    };
  }

  // Teto de 5: é o que o campo de variantes pede de uma vez.
  const count = Math.min(Math.max(input.count ?? 3, 1), 5);

  return generateFieldSuggestions({ ...input, count }, { config });
}
