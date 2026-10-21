import type { AiConfig } from "@/lib/ai/provider";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";

/**
 * Qual chave o botão de IA usa, em ordem: a do usuário logado, se ele
 * cadastrou; senão a da instalação (`fallback`, que já vem na prioridade
 * OpenRouter e depois OpenAI do ambiente); senão nenhuma e o botão some.
 */
export function resolveAiConfig(
  user: { apiKey: string; model: string | null; provider: AiProviderId } | null,
  fallback: AiConfig | null
): AiConfig | null {
  if (user?.apiKey.trim()) {
    // O modelo da instalação só vale para o mesmo provedor: id da OpenRouter
    // não existe na OpenAI e vice-versa.
    const inherited = fallback?.provider === user.provider ? fallback.model : null;
    return {
      provider: user.provider,
      apiKey: user.apiKey.trim(),
      model: user.model?.trim() || inherited || AI_PROVIDERS[user.provider].defaultModel,
    };
  }
  return fallback;
}
