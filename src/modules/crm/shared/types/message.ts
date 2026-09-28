/**
 * Mensagens do Inbox do CRM (tabela `messages`, migration 0009).
 */

export type MessageDirection = "inbound" | "outbound";

/**
 * Quem produziu a mensagem. Enviadas pelo Falow gravam a origem no envio;
 * eco sem registro prévio é `instagram_app` (a Meta não diferencia o eco de
 * uma mensagem mandada pela API de uma mandada pelo app, Fase 0).
 */
export type MessageSource =
  | "contact"
  | "automation"
  | "workflow"
  | "agent"
  | "instagram_app"
  | "import";

export type MessageKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "sticker"
  | "share"
  | "reel"
  | "story_reply"
  | "story_mention"
  | "postback"
  | "buttons"
  | "quick_replies"
  | "attachment"
  | "unsupported";

export interface MessageAttachment {
  /** Tipo informado pela Meta (image, audio, ig_reel, share...). */
  type: string;
  /** URL da CDN da Meta: expira e nunca é copiada (política da Meta). */
  url: string | null;
}

/** Mensagem já traduzida do formato da Meta, pronta para gravar. */
export interface MessageDraft {
  /** IGSID do lead (sempre o outro lado da conversa). */
  leadId: string;
  direction: MessageDirection;
  mid: string | null;
  kind: MessageKind;
  text: string | null;
  attachments: MessageAttachment[] | null;
  meta: Record<string, unknown> | null;
  replyToMid: string | null;
  /** Horário do evento na Meta (ISO). */
  createdAt: string;
}

/** Sinais que alteram uma mensagem já existente (podem chegar antes dela). */
export type MessageSignal =
  | { type: "reaction"; emoji: string }
  | { type: "unreaction" }
  | { type: "edit"; text: string; editCount: number }
  | { type: "deleted" };

export interface MessageRow {
  id: string;
  account_id: string;
  conversation_id: string;
  ig_sender_id: string;
  direction: MessageDirection;
  source: MessageSource;
  mid: string | null;
  kind: MessageKind;
  text: string | null;
  attachments: MessageAttachment[] | null;
  meta: Record<string, unknown> | null;
  reply_to_mid: string | null;
  reaction_emoji: string | null;
  sent_by: string | null;
  status: "sent" | "failed";
  error_detail: string | null;
  deleted_by_contact_at: string | null;
  edited_at: string | null;
  edit_count: number;
  original_text: string | null;
  hidden_at: string | null;
  created_at: string;
}
