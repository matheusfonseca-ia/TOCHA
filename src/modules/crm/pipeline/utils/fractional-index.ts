/**
 * Índice fracionário para ordenar os cards de uma coluna do funil sem
 * reindexar tudo a cada arrastar: a nova posição é a média das duas
 * vizinhas (ou um passo antes/depois quando é a 1ª/última). Só reindexa
 * (nova sequência com espaçamento largo) quando o intervalo fica pequeno
 * demais para o ponto flutuante representar com segurança.
 */

/** `numeric` do Postgres pode vir como string do PostgREST; a aritmética fracionária exige número de verdade. */
export function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Espaçamento usado entre posições novas e na reindexação. */
export const POSITION_GAP = 65536;

/** Abaixo deste intervalo entre vizinhos, é hora de reindexar a coluna. */
export const MIN_GAP = 1e-6;

/**
 * Posição para inserir um card entre `before` e `after` (nulo = ponta da
 * coluna). Sem nenhum dos dois, é o 1º card da coluna.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_GAP;
  if (before == null) return after! - POSITION_GAP;
  if (after == null) return before + POSITION_GAP;
  return (before + after) / 2;
}

/** true quando o intervalo entre vizinhos já não comporta mais uma média segura. */
export function needsReindex(before: number | null, after: number | null): boolean {
  if (before == null || after == null) return false;
  return after - before < MIN_GAP;
}

/** Nova sequência de posições, igualmente espaçadas, para N cards (na ordem atual). */
export function reindexPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_GAP);
}
