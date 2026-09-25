import type { ExpireAction } from "@/lib/expiry/expiry";
import type { MediaRef, Rule } from "@/types/database";

import type { LinkSlot } from "./links";

/**
 * Editar uma automação existente nas mesmas telas da criação (DM e
 * comentário). Funções puras: estado inicial dos formulários a partir da
 * rule salva e o que precisa ir junto no save para nada se perder.
 */

/** As telas completas só sabem texto e texto com botões de link. */
export function canEditInBuilder(rule: Pick<Rule, "reply_type">): boolean {
  return rule.reply_type !== "image";
}

export function linksFromRule(rule: Pick<Rule, "reply_type" | "reply_buttons">): LinkSlot[] {
  if (rule.reply_type !== "buttons") return [];
  return (rule.reply_buttons ?? []).map((b) => ({ title: b.title, url: b.url, touched: true }));
}

/**
 * Campos que as telas não mostram, mas que o save grava: sem isso, editar
 * pela tela voltaria o tipo de match para "contém", o delay para 3 s e
 * ativaria uma automação pausada.
 */
export function preservedFields(
  rule: Pick<Rule, "id" | "name" | "match_type" | "delay_seconds" | "is_active">
) {
  return {
    id: rule.id,
    name: rule.name ?? undefined,
    match_type: rule.match_type,
    delay_seconds: rule.delay_seconds,
    is_active: rule.is_active,
  };
}

/**
 * Expiração no save. Criando: só manda quando ligada. Editando: desligar o
 * campo numa automação que tinha data precisa gravar `null` (permanente);
 * `undefined` deixaria a data antiga salva.
 */
export function expiryFieldsForSave(
  resolved: { expires_at: string | null; expire_action: ExpireAction },
  rule?: Pick<Rule, "expires_at"> | null
): { expires_at?: string | null; expire_action?: ExpireAction } {
  if (resolved.expires_at) {
    return { expires_at: resolved.expires_at, expire_action: resolved.expire_action };
  }
  return rule?.expires_at ? { expires_at: null } : {};
}

/**
 * Mídias do seletor ao editar: as já escolhidas entram primeiro, mesmo que
 * não estejam entre as recentes da conta (senão ficariam marcadas e
 * invisíveis, sem como desmarcar).
 */
export function mergeSelectedMedia(recent: MediaRef[], selected: MediaRef[] | null): MediaRef[] {
  const seen = new Set<string>();
  return [...(selected ?? []), ...recent].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}
