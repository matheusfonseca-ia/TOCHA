import { keywordMatches } from "@/lib/rules/engine";
import type { TriggerNodeData } from "@/types/sequence";

/**
 * Classificação de eventos de entrada (`messaging[]` do webhook) nos 4 tipos
 * de gatilho que os workflows entendem, e o match desse evento contra o nó
 * Trigger de um workflow. Puro — sem banco, sem Graph API.
 *
 * Formatos confirmados na documentação da Meta (Instagram Messaging API,
 * "Webhooks for Instagram Messaging" + "Send Messages"):
 *  - Resposta a story: `message.reply_to.story = { id, url }`.
 *  - Menção em story: `message.attachments[] = [{ type: "story_mention", payload: { url } }]`
 *    (só menção EM STORY dispara webhook; marcar em post/feed não dispara).
 *  - Link de referência (ig.me/m/<usuário>?ref=<código>): `referral = { ref, source, type }`
 *    no próprio evento de `messaging[]` — pode vir sozinho (só abrindo a
 *    conversa, sem `message`) ou junto de uma mensagem de texto.
 */

export type InboundTriggerKind = "dm" | "storyReply" | "storyMention" | "refLink";

export interface ClassifiedInboundEvent {
  kind: InboundTriggerKind;
  /** Texto da mensagem, quando houver ("" para story mention/referral puro). */
  text: string;
  /** Só presente quando kind é "refLink": o código depois de "?ref=". */
  ref?: string;
}

interface InboundAttachment {
  type?: string;
}

interface InboundMessage {
  text?: string;
  reply_to?: { story?: { id?: string; url?: string } };
  attachments?: InboundAttachment[];
}

interface InboundMessagingEvent {
  message?: InboundMessage;
  referral?: { ref?: string; source?: string; type?: string };
}

/**
 * Classifica um evento de `messaging[]`. Retorna null quando não há sinal
 * nenhum pra iniciar um fluxo (sem texto, sem story, sem referral) — quem
 * chama descarta o evento (ex.: eco, delivery receipt sem conteúdo útil).
 *
 * Ordem de prioridade quando mais de um sinal aparece no mesmo evento: ref >
 * story reply > story mention > texto puro. Um link ig.me?ref= é o sinal
 * mais específico (identifica um gatilho exato), por isso vem primeiro.
 */
export function classifyInboundEvent(
  event: InboundMessagingEvent
): ClassifiedInboundEvent | null {
  const text = event.message?.text ?? "";

  const ref = event.referral?.ref;
  if (ref) return { kind: "refLink", text, ref };

  if (event.message?.reply_to?.story) {
    return { kind: "storyReply", text };
  }

  if (event.message?.attachments?.some((a) => a.type === "story_mention")) {
    return { kind: "storyMention", text };
  }

  if (text) return { kind: "dm", text };

  return null;
}

/**
 * O gatilho de um workflow casa com o evento classificado quando a fonte
 * bate (dm/storyReply/storyMention/refLink) e, se houver palavra-chave
 * configurada, ela também bate no texto do evento.
 *
 * "automation" nunca casa aqui: quem inicia esse tipo de fluxo é
 * `startSequenceFromRule` (ver runtime.ts), não um evento de entrada.
 *
 * Fora do modo "dm", a palavra-chave é um filtro OPCIONAL: a própria fonte
 * do evento (story reply, story mention, ref específico) já é um sinal
 * específico o bastante, então keyword vazia = qualquer evento desse tipo
 * dispara. No modo "dm" o editor sempre garante keyword OU anyMessage.
 */
export function triggerMatchesInbound(
  data: TriggerNodeData,
  event: ClassifiedInboundEvent
): boolean {
  const source = data.source ?? "dm";
  if (source === "automation") return false;
  if (source !== event.kind) return false;

  if (source === "refLink") {
    const code = (data.refCode ?? "").trim();
    if (!code || event.ref !== code) return false;
  }

  if (data.anyMessage) return true;

  const keyword = data.keyword.trim();
  if (!keyword) return source !== "dm";

  return keywordMatches(event.text, data.keyword, data.matchType);
}

/** URL pronta pra copiar do gatilho "Link de referência", pro editor mostrar. */
export function refLinkUrl(username: string, code: string): string {
  const user = username.trim() || "sua_conta";
  const safeCode = code.trim() || "codigo";
  return `https://ig.me/m/${user}?ref=${safeCode}`;
}
