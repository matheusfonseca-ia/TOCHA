import type { InboxFilters } from "../../shared/types/conversation";

export const INBOX_PATH = "/crm/conversas";

/** URL do Inbox mantendo os filtros; `conversationId` abre a conversa. */
export function inboxHref(filters: InboxFilters, conversationId?: string | null): string {
  const params = new URLSearchParams();
  if (filters.accountId) params.set("conta", filters.accountId);
  if (filters.unreadOnly) params.set("filtro", "nao-lidas");
  if (filters.q) params.set("q", filters.q);
  if (conversationId) params.set("c", conversationId);
  const qs = params.toString();
  return qs ? `${INBOX_PATH}?${qs}` : INBOX_PATH;
}
