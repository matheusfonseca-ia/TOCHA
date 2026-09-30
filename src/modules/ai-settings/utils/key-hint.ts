/** Só os 4 últimos caracteres voltam pro navegador, nunca a chave inteira. */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

/** Modelo da OpenRouter tem a forma `provedor/nome` (ex.: anthropic/claude-sonnet-4.5). */
export function isValidModelId(model: string): boolean {
  return /^[\w.-]+\/[\w.:-]+$/.test(model.trim());
}
