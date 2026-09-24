/**
 * Variantes de resposta: a automação de comentário pode ter mais de um texto
 * cadastrado (resposta pública, mensagem de boas-vindas) e o Falow sorteia
 * uma a cada disparo, para as respostas não ficarem todas iguais.
 *
 * `primary` é sempre a variante 1 (as colunas `public_reply_text` e
 * `welcome_text` de `rules`); `extras` são as variantes 2 em diante
 * (`public_reply_variants` e `welcome_text_variants`).
 */

/**
 * Junta a variante 1 com as extras, removendo espaços nas pontas, entradas
 * vazias e duplicadas (mantém a primeira ocorrência, então a primária vence
 * se repetida numa extra).
 */
export function allVariants(
  primary: string | null | undefined,
  extras: string[] | null | undefined
): string[] {
  const candidates = [primary ?? "", ...(extras ?? [])];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

/**
 * Sorteia uma variante entre a primária e as extras. `random` é injetável
 * para deixar o teste determinístico (default: `Math.random`). Sem nenhuma
 * variante válida, devolve `null`; com só uma, devolve ela sem sortear.
 */
export function pickVariant(
  primary: string | null | undefined,
  extras: string[] | null | undefined,
  random: () => number = Math.random
): string | null {
  const variants = allVariants(primary, extras);
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0];

  const index = Math.floor(random() * variants.length);
  // Trava o índice em [0, length - 1] mesmo se `random()` devolver 1
  // (não deveria, mas Math.random nunca devolve 1; só por segurança).
  return variants[Math.min(index, variants.length - 1)];
}
