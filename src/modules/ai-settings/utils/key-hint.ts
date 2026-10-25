/** Só os 4 últimos caracteres voltam pro navegador, nunca a chave inteira. */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}
