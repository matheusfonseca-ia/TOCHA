/**
 * Detecção de "o banco ainda não tem essa migration".
 *
 * O Falow é instalado por cada pessoa no próprio Supabase, então é normal o
 * código chegar antes do SQL rodar. Em vez de quebrar a tela, as features
 * novas somem sozinhas até a migration ser aplicada — mesma ideia do
 * `isMissingFollowGateColumn` da 0007, generalizada.
 */

export interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** Tabela inexistente: PostgREST responde PGRST205 com o nome no texto. */
export function isMissingTable(
  error: PostgrestLikeError | null | undefined,
  table: string
): boolean {
  const message = error?.message ?? "";
  if (!message.includes(table)) return false;
  return error?.code === "PGRST205" || /could not find the table/i.test(message);
}

/**
 * Coluna inexistente: vem como 42703 direto do Postgres ("column x.y does not
 * exist") ou como PGRST204 do cache de schema do PostgREST.
 */
export function isMissingColumn(
  error: PostgrestLikeError | null | undefined,
  column: string
): boolean {
  const message = error?.message ?? "";
  if (!message.includes(column)) return false;
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|schema cache/i.test(message)
  );
}
