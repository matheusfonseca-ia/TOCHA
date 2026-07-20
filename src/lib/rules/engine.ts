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
  keyword: string | null,
  matchType: MatchType
): boolean {
  const msg = normalizeText(message);
  const terms = (keyword ?? "")
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

function sortByPriority(rules: Rule[]): Rule[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority || a.created_at.localeCompare(b.created_at)
  );
}

/**
 * Primeira regra de DM ativa que casa com a mensagem.
 * Ordem: prioridade crescente, depois mais antiga primeiro (determinístico).
 */
export function findMatchingRule(message: string, rules: Rule[]): Rule | null {
  return (
    sortByPriority(rules).find(
      (r) =>
        r.is_active &&
        r.trigger_type !== "comment" &&
        keywordMatches(message, r.keyword, r.match_type)
    ) ?? null
  );
}

/**
 * Uma regra de comentário casa quando: a mídia bate (se media_mode="specific")
 * e o texto bate (a menos que comment_any_word deixe qualquer comentário passar).
 */
export function commentMatchesRule(
  rule: Rule,
  commentText: string,
  mediaId: string
): boolean {
  if (rule.trigger_type !== "comment") return false;

  if (rule.media_mode === "specific") {
    const ids = (rule.media_refs ?? []).map((m) => m.id);
    if (!ids.includes(mediaId)) return false;
  }

  if (rule.comment_any_word) return true;
  return keywordMatches(commentText, rule.keyword, rule.match_type);
}

/** Primeira regra de comentário ativa que casa com o comentário recebido. */
export function findMatchingCommentRule(
  commentText: string,
  mediaId: string,
  rules: Rule[]
): Rule | null {
  return (
    sortByPriority(rules).find(
      (r) => r.is_active && commentMatchesRule(r, commentText, mediaId)
    ) ?? null
  );
}

/** Regra de negócio: delay sempre entre 2 e 5 segundos. */
export function clampDelay(seconds: number): number {
  return Math.min(5, Math.max(2, Math.round(seconds)));
}
