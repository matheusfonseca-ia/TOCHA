import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

import { normalizeTag, sameTag } from "../utils/normalize-tag";

type AnyClient = ReturnType<typeof createAdminClient> | ReturnType<typeof createClient>;

/** O PostgREST devolve no máximo 1000 linhas por consulta. */
const PAGE = 1000;

export interface TaggedContact {
  account_id: string;
  ig_sender_id: string;
  tags: string[];
}

/**
 * Contatos que têm a tag em qualquer grafia (maiúscula/acento), a mesma regra
 * do catálogo e da Condição do workflow. O banco só compara grafia exata
 * (`contains`) ou só maiúscula (`lower()` nas funções de propagação), então a
 * busca varre os contatos com alguma tag, em páginas por id.
 * `accountId` vazio = todas as contas que o client enxerga (RLS).
 */
export async function findContactsWithTag(
  client: AnyClient,
  accountId: string,
  tagName: string
): Promise<TaggedContact[]> {
  const found: TaggedContact[] = [];
  let after = "";
  for (;;) {
    let query = client
      .from("contacts")
      .select("id, account_id, ig_sender_id, tags")
      .neq("tags", "{}")
      .order("id")
      .limit(PAGE);
    if (accountId) query = query.eq("account_id", accountId);
    if (after) query = query.gt("id", after);
    const { data } = await query;
    const rows = (data ?? []) as (TaggedContact & { id: string })[];
    for (const row of rows) {
      const tags = row.tags ?? [];
      if (tags.some((t) => sameTag(t, tagName))) {
        found.push({ account_id: row.account_id, ig_sender_id: row.ig_sender_id, tags });
      }
    }
    if (rows.length < PAGE) return found;
    after = rows[rows.length - 1].id;
  }
}

/**
 * Grafias da tag que existem de fato nos contatos, uma por variação de
 * maiúscula (as funções `crm_tag_rename`/`crm_tag_remove` já cobrem
 * maiúscula; o acento é resolvido aqui, chamando uma vez por grafia).
 */
export function spellingsOf(contacts: readonly TaggedContact[], tagName: string): string[] {
  const byLower = new Map<string, string>();
  for (const contact of contacts) {
    for (const tag of contact.tags) {
      if (sameTag(tag, tagName) && !byLower.has(tag.toLowerCase())) byLower.set(tag.toLowerCase(), tag);
    }
  }
  return Array.from(byLower.values());
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Grafias prováveis da tag: as do catálogo que batem com ela (sem
 * maiúscula/acento) e, de cada uma, a versão minúscula, maiúscula,
 * capitalizada e sem acento. Cobre o que o painel e os workflows gravam
 * (o nome vem do catálogo, ou digitado em outra caixa/sem acento).
 */
export function tagSpellingVariants(tagName: string, catalogNames: readonly string[] = []): string[] {
  const bases = [tagName.trim(), ...catalogNames.filter((n) => sameTag(n, tagName)).map((n) => n.trim())];
  const variants = new Set<string>();
  for (const base of bases) {
    if (!base) continue;
    for (const form of [base, normalizeTag(base)]) {
      variants.add(form);
      variants.add(form.toLowerCase());
      variants.add(form.toUpperCase());
      variants.add(capitalize(form.toLowerCase()));
    }
  }
  return Array.from(variants).filter(Boolean);
}

/**
 * IDs de remetente com a tag para o filtro do Inbox, pelo índice GIN de
 * `contacts.tags` (`tags @> {grafia}`, uma consulta por grafia provável, em
 * paralelo) em vez de varrer todos os contatos etiquetados em JS. Grafia
 * fora de `tagSpellingVariants` (ex.: acento só em parte) não entra: para
 * cobrir 100% seria preciso gravar a tag normalizada numa coluna própria.
 */
export async function findSenderIdsWithTag(
  client: AnyClient,
  accountId: string,
  tagName: string,
  catalogNames: readonly string[] = []
): Promise<{ account_id: string; ig_sender_id: string }[]> {
  const variants = tagSpellingVariants(tagName, catalogNames);
  const pages = await Promise.all(
    variants.map(async (variant) => {
      const found: { account_id: string; ig_sender_id: string }[] = [];
      let after = "";
      for (;;) {
        let query = client
          .from("contacts")
          .select("id, account_id, ig_sender_id")
          .contains("tags", [variant])
          .order("id")
          .limit(PAGE);
        if (accountId) query = query.eq("account_id", accountId);
        if (after) query = query.gt("id", after);
        const { data } = await query;
        const rows = (data ?? []) as { id: string; account_id: string; ig_sender_id: string }[];
        found.push(...rows);
        if (rows.length < PAGE) return found;
        after = rows[rows.length - 1].id;
      }
    })
  );
  const unique = new Map<string, { account_id: string; ig_sender_id: string }>();
  for (const row of pages.flat()) {
    unique.set(`${row.account_id}:${row.ig_sender_id}`, { account_id: row.account_id, ig_sender_id: row.ig_sender_id });
  }
  return Array.from(unique.values());
}
