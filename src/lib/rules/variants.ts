/**
 * Variantes de resposta: a automação de comentário pode ter mais de um texto
 * cadastrado (resposta pública, mensagem de boas-vindas) e o Falow sorteia
 * uma a cada disparo, para as respostas não ficarem todas iguais.
 *
 * `primary` é sempre a variante 1 (as colunas `public_reply_text` e
 * `welcome_text` de `rules`); `extras` são as variantes 2 em diante
 * (`public_reply_variants` e `welcome_text_variants`).
 */

/** Máximo de textos por mensagem, contando o principal (variante 1) mais as extras. */
export const MAX_VARIANTS = 10;

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
 * Cadastra `text` como mais uma variante (usado pelas respostas prontas):
 * preenche a variante 1 se ela estiver vazia, senão a primeira extra em
 * branco, senão entra no fim das extras. Texto já cadastrado, vazio ou que
 * passaria de `max` variantes no total devolve as listas sem mudança.
 */
export function addVariant(
  primary: string,
  extras: string[],
  text: string,
  max: number
): { primary: string; extras: string[] } {
  const trimmed = text.trim();
  if (!trimmed || allVariants(primary, extras).includes(trimmed)) {
    return { primary, extras };
  }
  if (!primary.trim()) return { primary: trimmed, extras };

  const blankIndex = extras.findIndex((extra) => !extra.trim());
  if (blankIndex >= 0) {
    return {
      primary,
      extras: extras.map((extra, i) => (i === blankIndex ? trimmed : extra)),
    };
  }
  if (extras.length + 1 >= max) return { primary, extras };
  return { primary, extras: [...extras, trimmed] };
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

/**
 * Limpa uma lista de variantes extras para gravar: apara as pontas e descarta
 * vazias. Devolve `null` (não `[]`) quando não sobra nenhuma, igual às colunas
 * `*_variants` que gravam nulo em vez de array vazio.
 */
export function cleanVariantList(variants: string[] | null | undefined): string[] | null {
  const cleaned = (variants ?? []).map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

export interface AddVariantsResult {
  primary: string;
  extras: string[];
  /** Quantas sugestões de fato entraram. */
  added: number;
  /** Quantas já estavam cadastradas (ou repetidas entre as escolhidas). */
  duplicates: number;
  /** Quantas ficaram de fora por passar do máximo de variantes. */
  cut: number;
}

/**
 * Cadastra várias sugestões de uma vez (janela "Escrever com IA"). Segue a
 * regra de `addVariant` para cada texto, em ordem: com o texto principal
 * vazio a 1ª escolhida vira o principal e as demais viram variações; com ele
 * preenchido todas entram como variações. Texto repetido não duplica e o que
 * passar de `max` variantes no total é cortado e contado em `cut`, para a
 * tela avisar.
 */
export function addVariants(
  primary: string,
  extras: string[],
  texts: readonly string[],
  max: number
): AddVariantsResult {
  let current = { primary, extras };
  let added = 0;
  let duplicates = 0;
  let cut = 0;

  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (allVariants(current.primary, current.extras).includes(trimmed)) {
      duplicates += 1;
      continue;
    }
    const next = addVariant(current.primary, current.extras, trimmed, max);
    if (next.primary === current.primary && next.extras === current.extras) {
      cut += 1;
      continue;
    }
    current = next;
    added += 1;
  }

  return { ...current, added, duplicates, cut };
}

/** Frase curta do que aconteceu ao cadastrar sugestões, para o aviso na tela. */
export function describeAddVariants(result: AddVariantsResult, max: number): string {
  const parts: string[] = [];
  parts.push(
    result.added === 0
      ? "Nenhuma sugestão nova entrou."
      : result.added === 1
        ? "1 sugestão adicionada."
        : `${result.added} sugestões adicionadas.`
  );
  if (result.duplicates > 0) {
    parts.push(
      result.duplicates === 1
        ? "1 já estava cadastrada."
        : `${result.duplicates} já estavam cadastradas.`
    );
  }
  if (result.cut > 0) {
    parts.push(
      `O limite é de ${max} variações no total, então ${
        result.cut === 1 ? "1 ficou" : `${result.cut} ficaram`
      } de fora.`
    );
  }
  return parts.join(" ");
}
