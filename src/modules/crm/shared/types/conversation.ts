import type { SequenceRunStatus } from "@/types/sequence";

import type { MessageDirection, MessageKind, MessageRow } from "./message";

export type ConversationStatus = "open" | "done";

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
  /** Preenchido enquanto um atendente assumiu a conversa (D3). */
  human_takeover_at: string | null;
  status: ConversationStatus;
  created_at: string;
}

/** As 3 abas da lista: Abertas (padrão), Não lidas, Concluídas. */
export type InboxStatusFilter = "open" | "unread" | "done";

export interface InboxFilters {
  /** Conta selecionada ("" = todas). */
  accountId: string;
  status: InboxStatusFilter;
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

export interface QuickReply {
  id: string;
  account_id: string;
  title: string;
  text: string;
}

export interface CrmNote {
  id: string;
  account_id: string;
  ig_sender_id: string;
  text: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxThread {
  conversation: InboxConversation;
  messages: MessageRow[];
  /** Há mensagens mais antigas que as carregadas. */
  hasOlder: boolean;
  panel: ContactPanelData;
  /** Notas internas do contato, intercaladas na conversa por horário. */
  notes: CrmNote[];
  /** Atalhos de texto da conta ("/" no composer). */
  quickReplies: QuickReply[];
}

export interface InboxAccount {
  id: string;
  ig_username: string;
}
