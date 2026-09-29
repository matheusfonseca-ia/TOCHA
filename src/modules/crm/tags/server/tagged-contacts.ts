import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

import { sameTag } from "../utils/normalize-tag";

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
