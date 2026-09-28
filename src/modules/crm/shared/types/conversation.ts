import type { SequenceRunStatus } from "@/types/sequence";

import type { MessageDirection, MessageKind, MessageRow } from "./message";

/** Linha da lista do Inbox (conversations + desnormalização da migration 0009). */
export interface InboxConversation {
  id: string;
  account_id: string;
  account_username: string | null;
  ig_sender_id: string;
  ig_sender_username: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_kind: MessageKind | null;
  last_message_direction: MessageDirection | null;
  /** Última mensagem do lead: abre a janela de 24h da Meta. */
  last_inbound_at: string | null;
  unread_count: number;
  contact_seen_at: string | null;
  automation_paused_until: string | null;
  created_at: string;
}

export interface InboxFilters {
  /** Conta selecionada ("" = todas). */
  accountId: string;
  unreadOnly: boolean;
  q: string;
}

export interface ContactRun {
  id: string;
  sequenceName: string;
  status: SequenceRunStatus;
  updatedAt: string;
}

/** Ficha lateral do lead. */
export interface ContactPanelData {
  fields: Record<string, unknown>;
  tags: string[];
  runs: ContactRun[];
}

export interface InboxThread {
  conversation: InboxConversation;
  messages: MessageRow[];
  /** Há mensagens mais antigas que as carregadas. */
  hasOlder: boolean;
  panel: ContactPanelData;
}

export interface InboxAccount {
  id: string;
  ig_username: string;
}
