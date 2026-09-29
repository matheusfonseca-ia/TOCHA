import type { MessageDraft } from "../../shared/types/message";

/**
 * Traduz o corpo de um envio pela Send API (o mesmo que `graph.ts` manda) e a
 * resposta da Meta no que o CRM grava. Corpos sem `message` (sender_action:
 * digitando, visto) não são mensagem e voltam null.
 */

interface SentBody {
  recipient?: { id?: string; comment_id?: string };
  reply_to?: { mid?: string };
  message?: {
    text?: string;
    quick_replies?: { title?: string; payload?: string }[];
    attachment?: {
      type?: string;
      payload?: {
        url?: string;
        template_type?: string;
        text?: string;
        elements?: { title?: string; buttons?: SentButton[] }[];
        buttons?: SentButton[];
      };
    };
  };
}

interface SentButton {
  type?: string;
  title?: string;
  url?: string;
  payload?: string;
}

function buttonsMeta(buttons: SentButton[] | undefined) {
  return (buttons ?? []).map((b) => ({ title: b.title ?? "", type: b.type ?? "", url: b.url ?? null }));
}

export function parseSentMessage(
  body: Record<string, unknown>,
  response: Record<string, unknown>,
  now = Date.now()
): MessageDraft | null {
  const sent = body as SentBody;
  const message = sent.message;
  if (!message) return null;

  // Resposta privada a comentário vai por comment_id: o IGSID do lead só vem
  // na resposta da Meta.
  const leadId =
    (typeof response.recipient_id === "string" && response.recipient_id) || sent.recipient?.id;
  if (!leadId) return null;

  const base = {
    leadId,
    direction: "outbound" as const,
    mid: typeof response.message_id === "string" ? response.message_id : null,
    replyToMid: sent.reply_to?.mid ?? null,
    createdAt: new Date(now).toISOString(),
  };

  const attachment = message.attachment;
  if (attachment?.type === "template") {
    const payload = attachment.payload ?? {};
    const element = payload.elements?.[0];
    return {
      ...base,
      kind: "buttons",
      text: payload.text ?? element?.title ?? null,
      attachments: null,
      meta: { buttons: buttonsMeta(payload.buttons ?? element?.buttons) },
    };
  }

  if (attachment) {
    const type = attachment.type ?? "file";
    // Figurinha de coração: sem URL, o balão mostra o emoji direto (igual à
    // recebida do lead).
    if (type === "like_heart") {
      return { ...base, kind: "sticker", text: null, attachments: null, meta: null };
    }
    return {
      ...base,
      kind: type === "image" || type === "video" || type === "audio" ? type : "file",
      text: null,
      attachments: [{ type, url: attachment.payload?.url ?? null }],
      meta: null,
    };
  }

  if (message.quick_replies?.length) {
    return {
      ...base,
      kind: "quick_replies",
      text: message.text ?? null,
      attachments: null,
      meta: { options: message.quick_replies.map((q) => q.title ?? "") },
    };
  }

  return { ...base, kind: "text", text: message.text ?? null, attachments: null, meta: null };
}
