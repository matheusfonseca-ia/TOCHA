import { AsyncLocalStorage } from "node:async_hooks";

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
    public readonly subcode?: number,
    /** Status HTTP da resposta (ausente quando o erro nem chegou a ter resposta). */
    public readonly status?: number
  ) {
    super(message);
    this.name = "GraphApiError";
  }
}

/** A requisição nem teve resposta (rede caiu ou estourou o timeout). */
export class GraphNetworkError extends GraphApiError {
  constructor(
    message: string,
    public readonly timedOut: boolean
  ) {
    super(message);
    this.name = "GraphNetworkError";
  }
}

/** fetch que rejeitou (rede/timeout) vira GraphNetworkError; o resto passa intacto. */
function asNetworkError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
  if (timedOut || err instanceof TypeError) {
    return new GraphNetworkError(
      timedOut ? "Graph API não respondeu a tempo" : `Falha de rede na Graph API: ${err.message}`,
      timedOut
    );
  }
  return err;
}

// Códigos da Meta para falha temporária: 1/2 (erro desconhecido/serviço
// indisponível), 4/17/32/613 (limite de chamadas), 341 (limite temporário).
const TRANSIENT_GRAPH_CODES: ReadonlySet<number> = new Set([1, 2, 4, 17, 32, 341, 613]);
const REQUEST_TIMEOUT_MS = 15_000;
// Até 2 novas tentativas, com espera curta: o envio roda dentro do orçamento
// de tempo da invocação, então só vale repetir falhas rápidas.
const RETRY_BACKOFF_MS = [500, 1_500] as const;
// Teto de tempo (desde a 1ª tentativa) para ainda repetir.
const RETRY_WINDOW_MS = 6_000;

/**
 * Falha que pode passar sozinha (limite de taxa, 5xx, rede, timeout). Erros
 * de validação (4xx com código da Meta como 100, 190, 551) são definitivos e
 * nunca são repetidos.
 */
export function isTransientGraphError(err: unknown): boolean {
  if (err instanceof GraphNetworkError) return true;
  if (err instanceof GraphApiError) {
    if (err.code !== undefined && TRANSIENT_GRAPH_CODES.has(err.code)) return true;
    if (err.status === 429 || (err.status !== undefined && err.status >= 500)) return true;
    return false;
  }
  return false;
}

/**
 * Executa a chamada repetindo falhas temporárias com backoff curto. POST que
 * estourou o timeout não é repetido: a Meta pode ter recebido a mensagem e a
 * pessoa a receberia em dobro (quem chama decide, ex.: o runtime reagenda).
 */
async function withGraphRetry<T>(
  method: "GET" | "POST",
  call: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const backoff = RETRY_BACKOFF_MS[attempt];
      const retryable =
        backoff !== undefined &&
        isTransientGraphError(err) &&
        !(method === "POST" && err instanceof GraphNetworkError && err.timedOut) &&
        Date.now() - startedAt + backoff < RETRY_WINDOW_MS;
      if (!retryable) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoff + Math.floor(Math.random() * 250)));
    }
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
      json.error?.error_subcode,
      res.status
    );
  }
  return json;
}

async function graphPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return withGraphRetry("POST", async () => {
    const res = await fetch(
      `${BASE}/${path}?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    ).catch((err: unknown) => {
      throw asNetworkError(err);
    });
    return parseGraphResponse(res);
  });
}

async function graphGet(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  return withGraphRetry("GET", async () => {
    const res = await fetch(`${BASE}/${path}?${qs}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((err: unknown) => {
      throw asNetworkError(err);
    });
    return parseGraphResponse(res);
  });
}

type Recipient = { id: string } | { comment_id: string };

export interface SentMessage {
  /** Corpo enviado à Send API ({recipient, message, ...}). */
  body: Record<string, unknown>;
  /** Resposta da Meta ({recipient_id, message_id}). */
  response: Record<string, unknown>;
}

type SendObserver = (sent: SentMessage) => Promise<void>;

const sendObserver = new AsyncLocalStorage<SendObserver>();

/** Contador de mensagens enviadas (ver `countSends`). */
export interface SendTally {
  sent: number;
}

const sendTally = new AsyncLocalStorage<SendTally>();

/**
 * Roda `fn` contando em `tally` as mensagens que saíram de verdade dentro
 * dela (inclusive nas chamadas aninhadas). Independe de `observeSends`: o
 * webhook usa para saber se um evento que falhou já falou com a pessoa.
 */
export function countSends<T>(tally: SendTally, fn: () => Promise<T>): Promise<T> {
  return sendTally.run(tally, fn);
}

function tallySend(): void {
  const tally = sendTally.getStore();
  if (tally) tally.sent++;
}

/**
 * Roda `fn` avisando `observer` a cada mensagem enviada com sucesso dentro
 * dela, inclusive em chamadas aninhadas (o observador mais interno vence).
 * É assim que o CRM grava os envios com a origem certa sem que cada ponto de
 * envio precise saber que ele existe. Falha do observador nunca derruba o envio.
 */
export function observeSends<T>(observer: SendObserver, fn: () => Promise<T>): Promise<T> {
  return sendObserver.run(observer, fn);
}

/** Citar uma mensagem ao responder (Fase 0 do CRM, 28/09/2026): confirmado
 *  que `reply_to` só funciona no TOPO do corpo, ao lado de `recipient`
 *  (dentro de `message` a Graph API devolve 400 "Invalid keys"). */
export interface SendOptions {
  replyToMid?: string | null;
}

async function sendMessage(
  igToken: string,
  recipient: Recipient,
  message: Record<string, unknown>,
  opts?: SendOptions
) {
  const body: Record<string, unknown> = { recipient, message };
  if (opts?.replyToMid) body.reply_to = { mid: opts.replyToMid };
  const response = await graphPost("me/messages", igToken, body);
  tallySend();
  const observer = sendObserver.getStore();
  if (observer) await observer({ body, response }).catch(() => {});
  return response;
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
  text: string,
  opts?: SendOptions
) {
  return sendMessage(igToken, { id: recipientId }, textBody(text), opts);
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

export type AttachmentKind = "image" | "audio" | "video" | "file";

/**
 * Anexo por URL pública (composer do painel, Fase 3 do CRM): a Meta baixa o
 * arquivo da URL informada, então precisa ser pública (bucket `crm-uploads`
 * do Supabase Storage). Tipo "file" cobre PDF e outros documentos.
 */
export function sendAttachmentMessage(
  igToken: string,
  recipientId: string,
  kind: AttachmentKind,
  url: string,
  opts?: SendOptions
) {
  return sendMessage(
    igToken,
    { id: recipientId },
    { attachment: { type: kind, payload: { url } } },
    opts
  );
}

/**
 * Figurinha de coração ("❤️", like_heart), o mesmo efeito de dar duplo
 * toque numa mensagem no app do Instagram. Confirmado na Fase 0: chega ao
 * lead como `attachment: {type: "like_heart"}` e o eco confirma o envio.
 */
export function sendLikeHeartSticker(
  igToken: string,
  recipientId: string,
  opts?: SendOptions
) {
  return sendMessage(
    igToken,
    { id: recipientId },
    { attachment: { type: "like_heart" } },
    opts
  );
}

/**
 * Marca as mensagens do lead como vistas (equivalente ao "✓✓" azul). Não é
 * uma mensagem: não passa por `observeSends`, igual ao indicador de digitando.
 */
export function sendMarkSeen(igToken: string, recipientId: string) {
  return graphPost("me/messages", igToken, {
    recipient: { id: recipientId },
    sender_action: "mark_seen",
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
export async function replyToComment(igToken: string, commentId: string, text: string) {
  const response = await graphPost(`${commentId}/replies`, igToken, {
    message: text.slice(0, 2200),
  });
  tallySend();
  return response;
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
 * mensagens, toques em botão postback (fluxos de comentário e sequências),
 * comentários, aberturas por link ig.me?ref= (gatilho "Link de referência")
 * e, para o CRM, reação, visto e edição do lead (os três confirmados com
 * conta real na Fase 0 do CRM, 28/09/2026).
 */
export const WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_referral",
  "comments",
  "message_reactions",
  "messaging_seen",
  "message_edit",
] as const;

export function subscribeAccountToWebhooks(igToken: string) {
  return graphPost("me/subscribed_apps", igToken, {
    subscribed_fields: WEBHOOK_FIELDS.join(","),
  });
}

/**
 * Perfil de quem conversa com a conta (User Profile API). A Meta só libera
 * depois que a pessoa mandou DM ou tocou num botão da conta.
 */
export async function getUserProfile(
  igToken: string,
  igScopedId: string
): Promise<{ username: string | null; name: string | null }> {
  const json = await graphGet(encodeURIComponent(igScopedId), igToken, {
    fields: "username,name",
  });
  return {
    username: typeof json.username === "string" ? json.username : null,
    name: typeof json.name === "string" ? json.name : null,
  };
}

/**
 * A pessoa segue a conta? (User Profile API, campo `is_user_follow_business`).
 * Mesma regra de consentimento do perfil: sem DM nem toque em botão da conta,
 * a Meta devolve erro 230 ("User consent is required").
 */
export async function getFollowsBusiness(
  igToken: string,
  igScopedId: string
): Promise<boolean> {
  const json = await graphGet(encodeURIComponent(igScopedId), igToken, {
    fields: "is_user_follow_business",
  });
  if (typeof json.is_user_follow_business !== "boolean") {
    throw new GraphApiError("Resposta sem is_user_follow_business");
  }
  return json.is_user_follow_business;
}

/** Perfil completo de quem conversa com a conta, para a ficha do lead do CRM. */
export interface UserProfileDetails {
  username: string | null;
  name: string | null;
  profilePicUrl: string | null;
  followerCount: number | null;
  followsBusiness: boolean | null;
  isVerified: boolean | null;
}

/**
 * Perfil completo (User Profile API): nome, @, foto, seguidores, se segue a
 * conta e se é verificado. Mesma regra de consentimento do `getUserProfile`
 * (só depois de DM ou toque em botão da conta). Campo ausente na resposta
 * vira null em vez de derrubar a chamada inteira.
 */
export async function getFullUserProfile(
  igToken: string,
  igScopedId: string
): Promise<UserProfileDetails> {
  const json = await graphGet(encodeURIComponent(igScopedId), igToken, {
    fields: "name,username,profile_pic,follower_count,is_user_follow_business,is_verified_user",
  });
  return {
    username: typeof json.username === "string" ? json.username : null,
    name: typeof json.name === "string" ? json.name : null,
    profilePicUrl: typeof json.profile_pic === "string" ? json.profile_pic : null,
    followerCount: typeof json.follower_count === "number" ? json.follower_count : null,
    followsBusiness:
      typeof json.is_user_follow_business === "boolean" ? json.is_user_follow_business : null,
    isVerified: typeof json.is_verified_user === "boolean" ? json.is_verified_user : null,
  };
}

/** Uma conversa listada pela Conversations API (histórico anterior ao CRM). */
export interface IgConversationSummary {
  id: string;
  participants: { data: { id: string; username?: string }[] };
}

/**
 * Página de conversas da conta (Conversations API). Usada só na importação
 * do histórico: o webhook em tempo real não precisa disto. `limit` pequeno
 * porque cada conversa da página ainda gasta 1 chamada extra para as
 * mensagens dela, e o Worker tem tempo de execução limitado.
 */
export async function listConversationsPage(
  igToken: string,
  after?: string,
  limit = 5
): Promise<{ conversations: IgConversationSummary[]; nextAfter: string | null }> {
  const params: Record<string, string> = {
    platform: "instagram",
    fields: "id,participants",
    limit: String(limit),
  };
  if (after) params.after = after;
  const json = await graphGet("me/conversations", igToken, params);
  const conversations = (json.data as IgConversationSummary[] | undefined) ?? [];
  const paging = json.paging as { cursors?: { after?: string }; next?: string } | undefined;
  const nextAfter = paging?.next && paging.cursors?.after ? paging.cursors.after : null;
  return { conversations, nextAfter };
}

/** Um anexo de mensagem devolvido pela Conversations API. */
export interface IgConversationAttachment {
  mime_type?: string;
  image_data?: { url?: string };
  video_data?: { url?: string };
  file_url?: string;
}

/** Uma mensagem de dentro de uma conversa (Conversations API). */
export interface IgConversationMessage {
  id: string;
  created_time: string;
  from?: { id: string; username?: string };
  to?: { data?: { id: string; username?: string }[] };
  message?: string;
  attachments?: { data?: IgConversationAttachment[] };
  reply_to?: { id?: string };
}

/**
 * As mensagens de uma conversa (Conversations API). A Meta só devolve as 20
 * mais recentes por conversa, sem paginação possível além disso (confirmado
 * na Fase 0 do CRM, 28/09/2026).
 */
export async function getConversationMessages(
  igToken: string,
  conversationId: string
): Promise<IgConversationMessage[]> {
  const json = await graphGet(conversationId, igToken, {
    fields: "messages{id,created_time,from,to,message,attachments,reply_to}",
  });
  const messages = json.messages as { data?: IgConversationMessage[] } | undefined;
  return messages?.data ?? [];
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
