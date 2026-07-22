import type { ReplyButton } from "@/types/database";

/**
 * Wrapper mínimo sobre a API do Instagram (graph.instagram.com) —
 * envio de mensagens, respostas a comentários e inscrição da conta nos
 * webhooks, sempre com o token da conta profissional (Login do Instagram).
 */

const VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const BASE = `https://graph.instagram.com/${VERSION}`;

export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

async function parseGraphResponse(
  res: Response
): Promise<Record<string, unknown>> {
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; error_subcode?: number };
    [key: string]: unknown;
  };
  if (!res.ok || json.error) {
    throw new GraphApiError(
      json.error?.message ?? `Graph API respondeu ${res.status}`,
      json.error?.code,
      json.error?.error_subcode
    );
  }
  return json;
}

async function graphPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${BASE}/${path}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }
  );
  return parseGraphResponse(res);
}

async function graphGet(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${BASE}/${path}?${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  return parseGraphResponse(res);
}

type Recipient = { id: string } | { comment_id: string };

function sendMessage(
  igToken: string,
  recipient: Recipient,
  message: Record<string, unknown>
) {
  return graphPost("me/messages", igToken, { recipient, message });
}

function textBody(text: string): Record<string, unknown> {
  return { text: text.slice(0, 1000) };
}

function buttonsBody(
  text: string,
  buttons: ReplyButton[]
): Record<string, unknown> {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [
          {
            title: text.slice(0, 80),
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "web_url",
              url: b.url,
              title: b.title.slice(0, 20),
            })),
          },
        ],
      },
    },
  };
}

/** Texto + 1 botão de postback (dispara um evento no webhook em vez de abrir um link). */
function postbackButtonBody(
  text: string,
  buttonLabel: string,
  payload: string
): Record<string, unknown> {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: [
          {
            type: "postback",
            title: buttonLabel.slice(0, 20),
            payload,
          },
        ],
      },
    },
  };
}

export function sendTextMessage(
  igToken: string,
  recipientId: string,
  text: string
) {
  return sendMessage(igToken, { id: recipientId }, textBody(text));
}

export function sendImageMessage(
  igToken: string,
  recipientId: string,
  imageUrl: string
) {
  return sendMessage(igToken, { id: recipientId }, {
    attachment: { type: "image", payload: { url: imageUrl } },
  });
}

/** Botões via generic template (suportado no Instagram Messaging). */
export function sendButtonsMessage(
  igToken: string,
  recipientId: string,
  text: string,
  buttons: ReplyButton[]
) {
  return sendMessage(igToken, { id: recipientId }, buttonsBody(text, buttons));
}

/**
 * Resposta privada a um comentário (gatilho da automação "Responder
 * Comentário"). Só pode ser enviada 1x por comentário, em até 7 dias.
 * O botão é postback — tocar nele dispara `messaging_postbacks`, que é
 * quando a 2ª mensagem (o link) é enviada como DM normal.
 */
export function sendPrivateReplyWithButton(
  igToken: string,
  commentId: string,
  text: string,
  buttonLabel: string,
  payload: string
) {
  return sendMessage(
    igToken,
    { comment_id: commentId },
    postbackButtonBody(text, buttonLabel, payload)
  );
}

/** Resposta pública, publicada como reply visível embaixo do comentário do usuário. */
export function replyToComment(igToken: string, commentId: string, text: string) {
  return graphPost(`${commentId}/replies`, igToken, {
    message: text.slice(0, 2200),
  });
}

export interface QuickReplyOption {
  title: string;
  payload: string;
}

/**
 * Texto + respostas rápidas (até 13 botões de 20 caracteres). Ao tocar, o
 * título vira mensagem do usuário e o webhook recebe
 * `message.quick_reply.payload` — é a ramificação dos nós de sequência.
 */
export function sendQuickRepliesMessage(
  igToken: string,
  recipientId: string,
  text: string,
  options: QuickReplyOption[]
) {
  return sendMessage(igToken, { id: recipientId }, {
    text: text.slice(0, 1000),
    quick_replies: options.slice(0, 13).map((o) => ({
      content_type: "text",
      title: o.title.slice(0, 20),
      payload: o.payload,
    })),
  });
}

export type TemplateButton =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

/**
 * Button template (texto até 640 chars + 1–3 botões), aceitando mistura de
 * botão de link (web_url) e de ramificação (postback) — usado pelos nós de
 * botões das sequências.
 */
export function sendTemplateButtonsMessage(
  igToken: string,
  recipientId: string,
  text: string,
  buttons: TemplateButton[]
) {
  return sendMessage(igToken, { id: recipientId }, {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: buttons.slice(0, 3).map((b) =>
          b.type === "web_url"
            ? { type: "web_url", title: b.title.slice(0, 20), url: b.url }
            : { type: "postback", title: b.title.slice(0, 20), payload: b.payload }
        ),
      },
    },
  });
}

/**
 * Indicador "digitando..." — a Meta recomenda exibi-lo antes de respostas
 * automáticas para a conversa parecer natural (best-effort: falha é ignorada
 * por quem chama).
 */
export function sendTypingAction(igToken: string, recipientId: string) {
  return graphPost("me/messages", igToken, {
    recipient: { id: recipientId },
    sender_action: "typing_on",
  });
}

/**
 * Inscreve a conta profissional nos eventos necessários para o webhook:
 * mensagens, toques em botão postback (fluxos de comentário e sequências)
 * e comentários.
 */
export function subscribeAccountToWebhooks(igToken: string) {
  return graphPost("me/subscribed_apps", igToken, {
    subscribed_fields: "messages,messaging_postbacks,comments",
  });
}

export interface IgMedia {
  id: string;
  caption: string | null;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string;
}

/** Publicações/Reels recentes da conta — alimenta o seletor de mídia do gatilho de comentário. */
export async function listRecentMedia(
  igToken: string,
  limit = 30
): Promise<IgMedia[]> {
  const json = await graphGet("me/media", igToken, {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
    limit: String(limit),
  });
  return (json.data as IgMedia[] | undefined) ?? [];
}
