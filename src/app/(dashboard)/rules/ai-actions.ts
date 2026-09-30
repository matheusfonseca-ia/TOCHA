"use server";

import type { AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { generateFieldSuggestions } from "@/lib/ai/provider";
import { getEffectiveAiConfig } from "@/modules/ai-settings/server";

/**
 * Botão ✨ dos campos de texto. A chave da IA nunca sai do servidor: o
 * cliente manda só o campo, a instrução e o contexto, e recebe as sugestões
 * prontas.
 *
 * A chave é a do usuário logado (tela Contas), com `OPENROUTER_API_KEY` da
 * instalação como padrão. Sem nenhuma das duas, `isAiEnabled` devolve false e
 * a UI nem mostra o botão.
 */

export async function isAiEnabled(): Promise<boolean> {
  return (await getEffectiveAiConfig()) !== null;
}

export type GenerateResult = { suggestions: string[] } | { error: string };

export async function generateForField(input: {
  field: AiFieldKind;
  count?: number;
  instruction?: string | null;
  context?: FieldPromptContext;
}): Promise<GenerateResult> {
  const config = await getEffectiveAiConfig();
  if (!config) {
    return {
      error:
        "IA sem chave. Cadastre a sua chave da OpenRouter na tela Contas.",
    };
  }

  // Teto de 5: é o que o campo de variantes pede de uma vez.
  const count = Math.min(Math.max(input.count ?? 3, 1), 5);

  return generateFieldSuggestions({ ...input, count }, { config });
}
