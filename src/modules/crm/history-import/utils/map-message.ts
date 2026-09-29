import type { IgConversationAttachment, IgConversationMessage } from "@/lib/meta/graph";

import type {
  MessageAttachment,
  MessageDirection,
  MessageDraft,
  MessageKind,
} from "../../shared/types/message";

/**
 * Traduz uma mensagem da Conversations API (histórico anterior ao CRM) no
 * que o Falow grava. Diferente do webhook em tempo real: aqui `leadId` já
 * vem resolvido de fora (o participante da conversa que não é a conta),
 * porque cada mensagem só traz `from`/`to`, não a lista de participantes.
 */

function attachmentKind(a: IgConversationAttachment): MessageKind {
  if (a.image_data) return "image";
  if (a.video_data) return "video";
  if (a.mime_type?.startsWith("audio/")) return "audio";
  if (a.file_url || a.mime_type) return "file";
  return "attachment";
}

function attachmentUrl(a: IgConversationAttachment): string | null {
  return a.image_data?.url ?? a.video_data?.url ?? a.file_url ?? null;
}

/** O participante da conversa que não é a conta (o lead). */
export function findLeadParticipant(
  participants: { id: string }[],
  accountIgUserId: string
): string | null {
  return participants.find((p) => p.id !== accountIgUserId)?.id ?? null;
}

export function mapImportedMessage(
  raw: IgConversationMessage,
  accountIgUserId: string,
  leadId: string
): MessageDraft {
  const direction: MessageDirection = raw.from?.id === accountIgUserId ? "outbound" : "inbound";
  const rawAttachments = raw.attachments?.data ?? [];
  const attachments: MessageAttachment[] | null = rawAttachments.length
    ? rawAttachments.map((a) => ({ type: a.mime_type ?? "attachment", url: attachmentUrl(a) }))
    : null;
  const text = raw.message?.trim() || null;

  // Texto vazio e sem anexo: enviada pela conta é mensagem com botões
  // (template, Fase 0); recebida do lead é mídia que a API não devolve (o
  // áudio da Fase 0 veio assim). Vira marcador em vez de balão em branco.
  let kind: MessageKind;
  if (attachments?.length) kind = attachmentKind(rawAttachments[0]);
  else if (!text) kind = direction === "outbound" ? "buttons" : "attachment";
  else kind = "text";

  return {
    leadId,
    direction,
    mid: raw.id,
    kind,
    text: kind === "buttons" || kind === "attachment" ? null : text,
    attachments,
    meta: null,
    replyToMid: raw.reply_to?.id ?? null,
    createdAt: new Date(raw.created_time).toISOString(),
  };
}
