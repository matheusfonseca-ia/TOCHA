import type { InteractionStatus, ReplyType } from "@/types/database";

export interface N8nMessageEvent {
  event: "message_processed";
  timestamp: string;
  account: { ig_user_id: string; ig_username: string };
  sender_id: string;
  message_text: string;
  result: {
    status: InteractionStatus;
    matched_keyword: string | null;
    rule_id: string | null;
    reply_type: ReplyType | null;
  };
}

/**
 * Dispara o webhook do n8n para cada mensagem processada.
 * Fire-and-forget: falha no n8n nunca derruba o processamento da mensagem.
 */
export async function fireN8nWebhook(
  url: string,
  payload: N8nMessageEvent
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch (err) {
    console.warn("[n8n] webhook falhou:", err instanceof Error ? err.message : err);
    return false;
  }
}
