import type { MatchType, Rule } from "@/types/database";

/**
 * Motor de matching de palavras-chave.
 * Normalização: minúsculas, sem acentos, espaços colapsados —
 * "Preço", "preco" e "  PREÇO " casam com a keyword "preco".
 * A keyword aceita múltiplos termos separados por vírgula — basta um
 * termo casar (OR) para a regra disparar.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordMatches(
  message: string,
  keyword: string,
  matchType: MatchType
): boolean {
  const msg = normalizeText(message);
  const terms = keyword
    .split(",")
    .map((term) => normalizeText(term))
    .filter(Boolean);

  return terms.some((kw) => {
    switch (matchType) {
      case "exact":
        return msg === kw;
      case "starts_with":
        return msg.startsWith(kw);
      case "contains":
        return msg.includes(kw);
    }
  });
}

/**
 * Primeira regra ativa que casa com a mensagem.
 * Ordem: prioridade crescente, depois mais antiga primeiro (determinístico).
 */
export function findMatchingRule(message: string, rules: Rule[]): Rule | null {
  const sorted = [...rules].sort(
    (a, b) =>
      a.priority - b.priority || a.created_at.localeCompare(b.created_at)
  );
  return (
    sorted.find(
      (r) => r.is_active && keywordMatches(message, r.keyword, r.match_type)
    ) ?? null
  );
}

/** Regra de negócio: delay sempre entre 2 e 5 segundos. */
export function clampDelay(seconds: number): number {
  return Math.min(5, Math.max(2, Math.round(seconds)));
}
