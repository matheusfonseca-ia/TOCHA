import { envModelFor, type AiConfig } from "@/lib/ai/provider";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";

/**
 * Qual chave o botão de IA usa, em ordem: a do usuário logado, se ele
 * cadastrou; senão a da instalação (`fallback`, que já vem na prioridade
 * OpenRouter e depois OpenAI do ambiente); senão nenhuma e o botão some.
 */
export function resolveAiConfig(
  user: { apiKey: string; model: string | null; provider: AiProviderId } | null,
  fallback: AiConfig | null,
  env: Record<string, string | undefined> = process.env
): AiConfig | null {
  if (user?.apiKey.trim()) {
    // Sem modelo próprio herda o que a instalação escolheu para o provedor da
    // chave (OPENROUTER_MODEL ou OPENAI_MODEL), mesmo que a chave padrão da
    // instalação seja de outro provedor. Id da OpenRouter não existe na OpenAI
    // e vice-versa, então nunca cruza provedores.
    return {
      provider: user.provider,
      apiKey: user.apiKey.trim(),
      model:
        user.model?.trim() ||
        envModelFor(user.provider, env) ||
        AI_PROVIDERS[user.provider].defaultModel,
    };
  }
  return fallback;
}
