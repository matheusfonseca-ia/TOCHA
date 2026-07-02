import type { ReplyButton } from "@/types/database";

/** Wrapper mínimo sobre a Meta Graph API (envio de mensagens do Instagram). */

const VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

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

function sendMessage(
  pageToken: string,
  recipientId: string,
  message: Record<string, unknown>
) {
  return graphPost("me/messages", pageToken, {
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message,
  });
}

export function sendTextMessage(pageToken: string, recipientId: string, text: string) {
  return sendMessage(pageToken, recipientId, { text: text.slice(0, 1000) });
}

export function sendImageMessage(pageToken: string, recipientId: string, imageUrl: string) {
  return sendMessage(pageToken, recipientId, {
    attachment: { type: "image", payload: { url: imageUrl } },
  });
}

/** Botões via generic template (suportado no Instagram Messaging). */
export function sendButtonsMessage(
  pageToken: string,
  recipientId: string,
  text: string,
  buttons: ReplyButton[]
) {
  return sendMessage(pageToken, recipientId, {
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
  });
}

/** Inscreve o app nos eventos de mensagens da página (necessário para o webhook). */
export function subscribePageToWebhooks(pageId: string, pageToken: string) {
  return graphPost(`${pageId}/subscribed_apps`, pageToken, {
    subscribed_fields: "messages",
  });
}
