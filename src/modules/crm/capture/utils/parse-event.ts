import type {
  MessageAttachment,
  MessageDraft,
  MessageKind,
  MessageSignal,
} from "../../shared/types/message";

/**
 * Traduz um evento `messaging[]` do webhook do Instagram no que o CRM grava.
 * Formatos conferidos com conta real na Fase 0 (28/09/2026):
 *  - mensagem:  message {mid, text?, attachments?, reply_to?, quick_reply?}
 *  - eco:       message {mid, text, is_echo: true} (API e app são idênticos)
 *  - apagada:   message {mid, is_deleted: true}
 *  - edição:    message_edit {mid, text, num_edit}
 *  - reação:    reaction {mid, action: "react" | "unreact", reaction, emoji}
 *  - visto:     read {mid}
 *  - toque em botão: postback {mid, title, payload}
 */

export interface IncomingMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    quick_reply?: { payload?: string };
    reply_to?: { mid?: string; story?: { id?: string; url?: string } };
    attachments?: { type?: string; payload?: { url?: string; title?: string } }[];
  };
  message_edit?: { mid?: string; text?: string; num_edit?: number };
  reaction?: { mid?: string; action?: string; reaction?: string; emoji?: string };
  read?: { mid?: string };
  postback?: { mid?: string; title?: string; payload?: string };
}

export type CaptureAction =
  | { type: "message"; message: MessageDraft; echo: boolean }
  | { type: "signal"; leadId: string; mid: string; signal: MessageSignal; at: string }
  | { type: "seen"; leadId: string; at: string };

const ATTACHMENT_KINDS: Record<string, MessageKind> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "file",
  share: "share",
  story_mention: "story_mention",
  ig_reel: "reel",
  reel: "reel",
  like_heart: "sticker",
  sticker: "sticker",
};

/** Horário do evento; relógio da Meta adiantado ou ausente usa o nosso. */
export function eventTime(timestampMs: number | undefined, now = Date.now()): string {
  return new Date(timestampMs && timestampMs <= now ? timestampMs : now).toISOString();
}

export function parseMessagingEvent(
  businessId: string,
  event: IncomingMessagingEvent,
  now = Date.now()
): CaptureAction | null {
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id;
  if (!senderId || !recipientId) return null;

  const fromBusiness = senderId === businessId;
  const leadId = fromBusiness ? recipientId : senderId;
  const at = eventTime(event.timestamp, now);

  // Reação, visto e edição só interessam quando vêm do lead: a conta não
  // reage pela API (falhou na Fase 0) e o "visto" da própria conta não
  // muda nada no painel.
  if (event.reaction) {
    const mid = event.reaction.mid;
    if (!mid || fromBusiness) return null;
    const signal: MessageSignal =
      event.reaction.action === "unreact"
        ? { type: "unreaction" }
        : { type: "reaction", emoji: event.reaction.emoji || event.reaction.reaction || "❤️" };
    return { type: "signal", leadId, mid, signal, at };
  }

  if (event.read) {
    return fromBusiness ? null : { type: "seen", leadId, at };
  }

  if (event.message_edit) {
    const { mid, text, num_edit } = event.message_edit;
    if (!mid || typeof text !== "string" || fromBusiness) return null;
    return { type: "signal", leadId, mid, signal: { type: "edit", text, editCount: num_edit ?? 1 }, at };
  }

  if (event.postback) {
    return {
      type: "message",
      echo: false,
      message: {
        leadId,
        direction: "inbound",
        mid: event.postback.mid ?? null,
        kind: "postback",
        text: event.postback.title ?? null,
        attachments: null,
        meta: event.postback.payload ? { payload: event.postback.payload } : null,
        replyToMid: null,
        createdAt: at,
      },
    };
  }

  const message = event.message;
  if (!message) return null;

  if (message.is_deleted) {
    return message.mid ? { type: "signal", leadId, mid: message.mid, signal: { type: "deleted" }, at } : null;
  }

  const attachments: MessageAttachment[] = (message.attachments ?? []).map((a) => ({
    type: a.type ?? "unknown",
    url: a.payload?.url ?? null,
  }));
  const story = message.reply_to?.story;
  const text = message.text ?? null;

  let kind: MessageKind;
  if (message.is_unsupported) kind = "unsupported";
  else if (story) kind = "story_reply";
  else if (attachments.length) kind = ATTACHMENT_KINDS[attachments[0].type] ?? "attachment";
  else if (text) kind = "text";
  else return null; // ex.: abertura por link ig.me sem mensagem

  const meta: Record<string, unknown> = {};
  if (story) meta.story = { id: story.id ?? null, url: story.url ?? null };
  if (message.quick_reply?.payload) meta.quickReplyPayload = message.quick_reply.payload;

  return {
    type: "message",
    echo: Boolean(message.is_echo),
    message: {
      leadId,
      direction: fromBusiness ? "outbound" : "inbound",
      mid: message.mid ?? null,
      kind,
      text,
      attachments: attachments.length ? attachments : null,
      meta: Object.keys(meta).length ? meta : null,
      replyToMid: message.reply_to?.mid ?? null,
      createdAt: at,
    },
  };
}
