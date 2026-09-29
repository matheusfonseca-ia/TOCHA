/**
 * Nenhum teste fala com a rede de verdade (Graph API, Supabase): quem precisa
 * de resposta HTTP mocka o `fetch` no próprio teste (`vi.stubGlobal`). Sem
 * isto, um caminho que chama a Meta por acidente ficaria lento e dependente
 * de internet em vez de falhar na hora.
 */
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`Rede desligada nos testes: ${String(input).split("?")[0]}`);
}) as typeof fetch;
