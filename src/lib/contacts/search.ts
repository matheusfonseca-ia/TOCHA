import type { Contact } from "@/types/database";

/**
 * Busca da página Contatos (tabela e export CSV): sem maiúscula/acento, todos
 * os termos precisam aparecer no @, id, conta, valores dos campos ou tags.
 */

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export type SearchableContact = Pick<Contact, "ig_username" | "ig_sender_id" | "fields" | "tags"> & {
  ig_accounts?: { ig_username: string } | null;
};

/** Texto em que a busca procura: @, id, conta, valores dos campos e tags. */
export function contactSearchText(c: SearchableContact): string {
  return normalizeSearch(
    [
      c.ig_username ?? "",
      c.ig_sender_id,
      c.ig_accounts?.ig_username ?? "",
      ...Object.values(c.fields ?? {}).map(String),
      ...(c.tags ?? []),
    ].join(" ")
  );
}

export function searchTerms(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

export function matchesTerms(text: string, terms: readonly string[]): boolean {
  return terms.every((t) => text.includes(t));
}
