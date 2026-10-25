/**
 * Catálogo dos provedores de IA que o botão ✨ sabe usar. Dado puro (sem
 * fetch nem env), compartilhado entre o provedor, o servidor e a tela Contas.
 * Copy de tela (placeholders, links das chaves) mora em `modules/ai-settings`.
 */

export type AiProviderId = "openrouter" | "openai";

export const AI_PROVIDER_IDS: readonly AiProviderId[] = ["openrouter", "openai"];

export interface AiProviderInfo {
  id: AiProviderId;
  /** Nome na tela e nas mensagens de erro ("Confere sua chave da OpenAI"). */
  label: string;
  /** Endpoint de chat completions. */
  endpoint: string;
  /** Modelo usado quando nem o usuário nem a instalação escolheram um. */
  defaultModel: string;
}

/** Modelo padrão da OpenRouter (o mesmo de sempre). */
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

/**
 * Modelo padrão da OpenAI: o mais barato da linha atual (GPT-6 Luna, id
 * confirmado na doc da OpenAI e na OpenRouter em out/2026). Troca pelo campo
 * Modelo da tela Contas ou por OPENAI_MODEL.
 */
export const OPENAI_DEFAULT_MODEL = "gpt-6-luna";

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: OPENROUTER_DEFAULT_MODEL,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: OPENAI_DEFAULT_MODEL,
  },
};

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "openrouter" || value === "openai";
}

/**
 * Provedor de uma chave pelo prefixo, para quando o banco ainda não tem a
 * coluna `provider` (migration 0018): chave da OpenRouter começa com `sk-or-`;
 * qualquer outra `sk-` é da OpenAI. Antes da 0018 só existia OpenRouter, então
 * sem prefixo reconhecível o palpite é a OpenRouter.
 */
export function inferProviderFromKey(apiKey: string): AiProviderId {
  const key = apiKey.trim();
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("sk-")) return "openai";
  return "openrouter";
}

/**
 * Modelo da OpenRouter tem a forma `provedor/nome` (ex.: anthropic/claude-sonnet-4.5);
 * o da OpenAI é um id simples (ex.: gpt-6-luna).
 */
export function isValidModelId(model: string, provider: AiProviderId = "openrouter"): boolean {
  const trimmed = model.trim();
  return provider === "openai"
    ? /^[\w.:-]+$/.test(trimmed)
    : /^[\w.-]+\/[\w.:-]+$/.test(trimmed);
}

/** Exemplo de id de modelo para a mensagem de erro de formato. */
export function modelFormatHint(provider: AiProviderId): string {
  return provider === "openai"
    ? `Modelo da OpenAI é só o nome, por exemplo ${OPENAI_DEFAULT_MODEL}.`
    : `Modelo da OpenRouter no formato provedor/nome, por exemplo ${OPENROUTER_DEFAULT_MODEL}.`;
}
