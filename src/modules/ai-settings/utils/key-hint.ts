/** Só os 4 últimos caracteres voltam pro navegador, nunca a chave inteira. */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

/**
 * Formato do id do modelo por provedor (OpenRouter `provedor/nome`, OpenAI só
 * o nome). Mora em `@/lib/ai/providers`, junto do catálogo dos provedores.
 */
export { isValidModelId } from "@/lib/ai/providers";
