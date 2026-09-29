import type { InboxFilters } from "../../shared/types/conversation";

export const INBOX_PATH = "/crm/conversas";

/** URL do Inbox mantendo os filtros; `conversationId` abre a conversa. */
export function inboxHref(filters: InboxFilters, conversationId?: string | null): string {
  const params = new URLSearchParams();
  if (filters.accountId) params.set("conta", filters.accountId);
  if (filters.status === "unread") params.set("filtro", "nao-lidas");
  else if (filters.status === "done") params.set("filtro", "concluidas");
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (conversationId) params.set("c", conversationId);
  const qs = params.toString();
  return qs ? `${INBOX_PATH}?${qs}` : INBOX_PATH;
}
