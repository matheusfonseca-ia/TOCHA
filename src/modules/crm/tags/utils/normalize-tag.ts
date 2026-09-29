import { normalize } from "@/lib/sequences/condition";
import { TAG_MAX } from "@/lib/sequences/fields";

/**
 * Mesma normalização da Condição do workflow (NFD sem acento, trim,
 * minúsculas), reaproveitada para o catálogo de tags nunca duplicar por
 * maiúscula/acento (ex.: "VIP" e "vip" são a mesma tag).
 */
export const normalizeTag = normalize;

export const TAG_NAME_MAX = TAG_MAX;

export function sameTag(a: string, b: string): boolean {
  return normalizeTag(a) === normalizeTag(b);
}

/** Nome pronto para gravar: espaços das pontas cortados, até o limite de tamanho. */
export function cleanTagName(raw: string): string {
  return raw.trim().slice(0, TAG_NAME_MAX);
}

/**
 * Remove duplicatas por maiúscula/acento mantendo a 1ª grafia encontrada
 * (usado para montar o catálogo a partir de `contacts.tags` existentes).
 */
export function dedupeTagsCaseInsensitive(tags: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of tags) {
    const name = cleanTagName(raw);
    if (!name) continue;
    const key = normalizeTag(name);
    if (!seen.has(key)) seen.set(key, name);
  }
  return Array.from(seen.values());
}
