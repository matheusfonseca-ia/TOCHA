"use server";

import { z } from "zod";

import { AI_FIELD_SPECS, type AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { generateFieldSuggestions } from "@/lib/ai/provider";
import { activeUserId } from "@/lib/auth/require-access";
import { getEffectiveAiConfig } from "@/modules/ai-settings/server";

/**
 * Botão ✨ dos campos de texto. A chave da IA nunca sai do servidor: o
 * cliente manda só o campo, a instrução e o contexto, e recebe as sugestões
 * prontas.
 *
 * A chave é a do usuário logado (tela Contas, OpenRouter ou OpenAI). A da
 * instalação (`OPENROUTER_API_KEY`, depois `OPENAI_API_KEY`) só vale para o
 * dono e os admins: o custo dela é do dono, então cliente sem chave própria
 * fica sem o botão. Sem nenhuma chave, `isAiEnabled` devolve false e a UI nem
 * mostra o botão. `generateForField` resolve a chave de novo porque uma
 * server action pode ser chamada direto, sem passar pela UI.
 */

export async function isAiEnabled(): Promise<boolean> {
  return (await getEffectiveAiConfig()) !== null;
}

export type GenerateResult = { suggestions: string[] } | { error: string };

const FIELD_KINDS = Object.keys(AI_FIELD_SPECS) as [AiFieldKind, ...AiFieldKind[]];
const contextText = z.string().max(200).nullish();

/**
 * O tipo TypeScript não vale em runtime: a action pode ser chamada direto.
 * Campo fora do catálogo quebraria o prompt; instrução/contexto sem teto
 * viraria custo na chave de quem chama.
 */
const generateSchema = z.object({
  field: z.enum(FIELD_KINDS),
  // Teto de 5: é o que o campo de variantes pede de uma vez.
  count: z.number().int().min(1).max(5).optional(),
  instruction: z.string().max(300, "Instrução muito longa: máximo de 300 caracteres.").nullish(),
  context: z
    .object({ ruleName: contextText, keyword: contextText, accountUsername: contextText })
    .optional(),
});

export async function generateForField(input: {
  field: AiFieldKind;
  count?: number;
  instruction?: string | null;
  context?: FieldPromptContext;
}): Promise<GenerateResult> {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue.path[0] === "instruction" ? issue.message : "Pedido inválido para a IA. Recarregue a página e tente de novo.",
    };
  }

  // Bloqueado/sem assinatura não gasta IA, nem a própria chave.
  if (!(await activeUserId())) {
    return { error: "Sua assinatura não está ativa. Acesse Minha assinatura para reativar." };
  }

  const config = await getEffectiveAiConfig();
  if (!config) {
    return {
      error:
        "IA sem chave. Cadastre a sua chave da OpenRouter ou da OpenAI na tela Contas.",
    };
  }

  const { field, instruction, context } = parsed.data;
  return generateFieldSuggestions({ field, instruction, context, count: parsed.data.count ?? 3 }, { config });
}
