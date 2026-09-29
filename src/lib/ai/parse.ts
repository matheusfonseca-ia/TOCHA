/**
 * Leitura da resposta do modelo. O prompt pede um array JSON, mas modelo
 * ignora formato o tempo todo: volta com bloco de código, lista numerada,
 * preâmbulo ("Claro! Aqui estão..."), aspas sobrando. Aqui a gente aceita
 * tudo isso e devolve as sugestões limpas.
 *
 * Sugestão maior que o limite do campo é DESCARTADA, não cortada: cortar no
 * meio entrega frase pela metade, e é melhor mostrar duas opções boas do que
 * três com uma quebrada.
 */

export interface SuggestionLimits {
  maxChars: number;
  count: number;
}

/** Remove cerca de bloco de código markdown (```json ... ```). */
function stripCodeFence(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1] : raw;
}

/** Tira marcador de lista ("1. ", "- ", "• ") e aspas nas pontas. */
function cleanLine(line: string): string {
  const withoutMarker = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "");
  const trimmed = withoutMarker.trim();
  const unquoted = trimmed.replace(/^["'“”](.*)["'“”]$/s, "$1");
  return unquoted.trim().replace(/,$/, "");
}

function fromJson(text: string): string[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

/**
 * Sem JSON válido: cada linha vira candidata. Linha com marcador de lista tem
 * preferência — quando existe pelo menos uma, o resto (preâmbulo, rodapé) é
 * descartado.
 */
function fromLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const marked = lines.filter((line) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(line));
  return (marked.length ? marked : lines).map(cleanLine);
}

export function parseSuggestions(
  raw: string,
  { maxChars, count }: SuggestionLimits
): string[] {
  const text = stripCodeFence(raw ?? "").trim();
  if (!text) return [];

  const candidates = fromJson(text) ?? fromLines(text);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    const clean = cleanLine(candidate);
    if (!clean || clean.length > maxChars || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length === count) break;
  }

  return result;
}
