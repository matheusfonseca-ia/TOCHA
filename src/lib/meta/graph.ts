import type { ReplyButton } from "@/types/database";

/**
 * Wrapper mínimo sobre a API do Instagram (graph.instagram.com) —
 * envio de mensagens e inscrição da conta nos webhooks, sempre com o
 * token da conta profissional (Login do Instagram).
 */

const VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
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
  igToken: string,
  recipientId: string,
  message: Record<string, unknown>
) {
  return graphPost("me/messages", igToken, {
    recipient: { id: recipientId },
    message,
  });
}

export function sendTextMessage(igToken: string, recipientId: string, text: string) {
  return sendMessage(igToken, recipientId, { text: text.slice(0, 1000) });
}

export function sendImageMessage(igToken: string, recipientId: string, imageUrl: string) {
  return sendMessage(igToken, recipientId, {
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
  return sendMessage(igToken, recipientId, {
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

/** Inscreve a conta profissional nos eventos de mensagens (necessário para o webhook). */
export function subscribeAccountToWebhooks(igToken: string) {
  return graphPost("me/subscribed_apps", igToken, {
    subscribed_fields: "messages",
  });
}
