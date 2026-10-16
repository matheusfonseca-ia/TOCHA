"use server";

import type { AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { aiConfigFromEnv, generateFieldSuggestions } from "@/lib/ai/provider";
import { isOwner } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Botão ✨ dos campos de texto. A chave da IA nunca sai do servidor: o
 * cliente manda só o campo, a instrução e o contexto, e recebe as sugestões
 * prontas.
 *
 * Só o dono da instalação (`FALOW_OWNER_USER_ID`) vê e usa o botão: a chave é
 * dele e o custo também. Sem `OPENROUTER_API_KEY` configurada, ou para qualquer
 * outro usuário, `isAiEnabled` devolve false e a UI nem mostra o botão.
 * `generateForField` repete a checagem porque uma server action pode ser
 * chamada direto, sem passar pela UI.
 */

async function currentUserIsOwner(): Promise<boolean> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return isOwner(user?.id);
}

export async function isAiEnabled(): Promise<boolean> {
  return aiConfigFromEnv() !== null && (await currentUserIsOwner());
}

export type GenerateResult = { suggestions: string[] } | { error: string };

export async function generateForField(input: {
  field: AiFieldKind;
  count?: number;
  instruction?: string | null;
  context?: FieldPromptContext;
}): Promise<GenerateResult> {
  if (!(await currentUserIsOwner())) {
    return { error: "A escrita com IA não está disponível nesta conta." };
  }

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
