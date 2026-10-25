/**
 * Nenhum teste fala com a rede de verdade (Graph API, Supabase): quem precisa
 * de resposta HTTP mocka o `fetch` no próprio teste (`vi.stubGlobal`). Sem
 * isto, um caminho que chama a Meta por acidente ficaria lento e dependente
 * de internet em vez de falhar na hora.
 */
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`Rede desligada nos testes: ${String(input).split("?")[0]}`);
}) as typeof fetch;

/**
 * Os fixtures usam `user_id: "user-1"` (makeAccount). Marcá-lo como dono
 * mantém os testes antigos com acesso liberado sem precisar de assinatura;
 * testes de cobrança usam outros ids.
 */
process.env.FALOW_OWNER_USER_ID = "user-1";
