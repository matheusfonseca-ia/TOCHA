import { DEFAULT_MODEL, type AiConfig } from "@/lib/ai/provider";

/**
 * Qual chave o botão de IA usa: a do usuário logado, se ele cadastrou; senão
 * a da instalação (OPENROUTER_API_KEY); senão nenhuma e o botão some.
 */
export function resolveAiConfig(
  user: { apiKey: string; model: string | null } | null,
  fallback: AiConfig | null
): AiConfig | null {
  if (user?.apiKey.trim()) {
    return {
      apiKey: user.apiKey.trim(),
      // Sem modelo próprio herda o da instalação, depois o padrão.
      model: user.model?.trim() || fallback?.model || DEFAULT_MODEL,
    };
  }
  return fallback;
}
