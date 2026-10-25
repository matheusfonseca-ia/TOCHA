import type { AiProviderId } from "@/lib/ai/providers";

/** Copy do card de IA da tela Contas, por provedor. */
export interface AiProviderUi {
  /** Onde a pessoa cria a chave. */
  keysUrl: string;
  keysUrlLabel: string;
  keyPlaceholder: string;
}

export const AI_PROVIDER_UI: Record<AiProviderId, AiProviderUi> = {
  openrouter: {
    keysUrl: "https://openrouter.ai/keys",
    keysUrlLabel: "openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-...",
  },
  openai: {
    keysUrl: "https://platform.openai.com/api-keys",
    keysUrlLabel: "platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
  },
};
