"use server";

import { randomUUID } from "node:crypto";

import { activeUserId } from "@/lib/auth/require-access";
import {
  GraphApiError,
  sendAttachmentMessage,
  sendLikeHeartSticker,
  sendTextMessage,
  type AttachmentKind,
} from "@/lib/meta/graph";
import { AccountNotActiveError, getFreshToken } from "@/lib/meta/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import {
  classifyUpload,
  contentMatchesType,
  isOwnUploadUrl,
  isSendableKind,
  SNIFF_BYTES,
  type UploadKind,
} from "../utils/attachment-types";
import { observeOutbound } from "@/modules/crm/server";

import { setTakeover } from "../../handoff/server/takeover";

const MAX_TEXT = 1000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const BUCKET = "crm-uploads";
const NO_ACCESS = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";

interface ConversationOwner {
  id: string;
  account_id: string;
  ig_sender_id: string;
  last_inbound_at: string | null;
}

/** Confere a posse da conversa com o client do usuário (RLS). */
async function ownConversation(conversationId: string): Promise<ConversationOwner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, account_id, ig_sender_id, last_inbound_at")
    .eq("id", conversationId)
    .maybeSingle<ConversationOwner>();
  return data ?? null;
}

function isWindowOpen(lastInboundAt: string | null): boolean {
  return Boolean(lastInboundAt) && Date.now() - Date.parse(lastInboundAt as string) < WINDOW_24H_MS;
}

const WINDOW_CLOSED_MESSAGE =
  "Janela fechada: o Instagram só deixa responder até 24h depois da última mensagem do lead.";

function friendlyError(err: unknown): string {
  if (err instanceof AccountNotActiveError) {
    return "Esta conta do Instagram está desconectada. Reconecte para enviar mensagens.";
  }
  if (err instanceof GraphApiError) {
    if (err.code === 10 && err.subcode === 2018278) return WINDOW_CLOSED_MESSAGE;
    if (err.code === 190) return "O token desta conta expirou. Reconecte a conta do Instagram.";
  }
  // Texto cru da Graph API (ids internos) fica só no log do servidor.
  console.error("[crm] falha ao enviar pelo painel:", err instanceof Error ? err.message : err);
  return "Não foi possível enviar. Tente de novo.";
}

export interface SendMessageInput {
  text?: string;
  attachmentUrl?: string;
  attachmentKind?: AttachmentKind;
  replyToMid?: string | null;
  /** Figurinha de coração (❤️), sem texto. */
  heart?: boolean;
}

/**
 * `attachmentSent`: o anexo saiu e só o texto que ia junto falhou. O retry
 * manda só o texto, senão o lead receberia o anexo duas vezes.
 */
export type SendMessageResult = { ok: true } | { error: string; attachmentSent?: boolean };

/**
 * Envia uma mensagem pelo painel (texto, anexo e/ou coração, com citação
 * opcional). Sempre assume a conversa (D3): enquanto o atendente responde,
 * nenhuma automação roda para esta pessoa.
 */
export async function sendMessage(
  conversationId: string,
  input: SendMessageInput
): Promise<SendMessageResult> {
  const userId = await activeUserId();
  if (!userId) return { error: NO_ACCESS };

  const conversation = await ownConversation(conversationId);
  if (!conversation) return { error: "Conversa não encontrada." };
  if (!isWindowOpen(conversation.last_inbound_at)) return { error: WINDOW_CLOSED_MESSAGE };

  const text = typeof input.text === "string" ? input.text.trim().slice(0, MAX_TEXT) : "";
  // Anexo só se veio do upload do próprio painel, para esta conta: a Meta
  // baixa a URL e a URL fica gravada (e clicável) no Inbox.
  if (input.attachmentUrl || input.attachmentKind) {
    if (
      !isSendableKind(input.attachmentKind) ||
      !isOwnUploadUrl(input.attachmentUrl, process.env.NEXT_PUBLIC_SUPABASE_URL, conversation.account_id)
    ) {
      return { error: "Anexo inválido. Envie o arquivo de novo." };
    }
  }
  if (!text && !input.attachmentUrl && !input.heart) return { error: "Nada para enviar." };

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("id", conversation.account_id)
    .maybeSingle<IgAccount>();
  if (!account) return { error: "Conta desconectada." };

  let attachmentSent = false;
  try {
    const token = await getFreshToken(admin, account);
    const opts = { replyToMid: input.replyToMid ?? undefined };

    await observeOutbound(
      { accountId: account.id, source: "agent", sentBy: userId },
      async () => {
        if (input.heart) {
          await sendLikeHeartSticker(token, conversation.ig_sender_id, opts);
        } else if (input.attachmentUrl && input.attachmentKind) {
          await sendAttachmentMessage(token, conversation.ig_sender_id, input.attachmentKind, input.attachmentUrl, opts);
          attachmentSent = true;
          if (text) await sendTextMessage(token, conversation.ig_sender_id, text);
        } else {
          await sendTextMessage(token, conversation.ig_sender_id, text, opts);
        }
      }
    );
  } catch (err) {
    if (!attachmentSent) return { error: friendlyError(err) };
    // O anexo já chegou ao lead: a conversa já é do atendente (D3).
    await setTakeover(admin, conversationId, true);
    return { error: `O anexo foi enviado, mas o texto não. ${friendlyError(err)}`, attachmentSent: true };
  }

  await setTakeover(admin, conversationId, true);
  return { ok: true };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "arquivo";
}

export type UploadAttachmentResult = { url: string; kind: UploadKind } | { error: string };

const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg"];

/**
 * Content-Type confirmado pelos primeiros bytes do arquivo. Imagem declarada
 * PNG que na verdade é JPEG (ou o contrário) é aceita com o tipo real.
 */
async function sniffContentType(file: File, kind: UploadKind, declared: string): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  if (kind === "image") return IMAGE_CONTENT_TYPES.find((t) => contentMatchesType(t, head)) ?? null;
  return contentMatchesType(declared, head) ? declared : null;
}

/**
 * Sobe o anexo pra o bucket público `crm-uploads` (arquivo do usuário, não
 * da Meta) e devolve a URL pública para o envio.
 */
export async function uploadComposerAttachment(formData: FormData): Promise<UploadAttachmentResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS };

  const conversationId = String(formData.get("conversationId") ?? "");
  const file = formData.get("file");
  if (!conversationId || !(file instanceof File)) return { error: "Arquivo inválido." };

  const conversation = await ownConversation(conversationId);
  if (!conversation) return { error: "Conversa não encontrada." };

  const check = classifyUpload(file.type, file.size, file.name);
  if ("error" in check) return { error: check.error };

  const contentType = await sniffContentType(file, check.kind, check.contentType);
  if (!contentType) {
    return { error: "O conteúdo do arquivo não confere com o tipo. Envie uma imagem (PNG ou JPG), um PDF ou um áudio (M4A ou WAV)." };
  }

  const admin = createAdminClient();
  const path = `${conversation.account_id}/${randomUUID()}-${sanitizeFileName(file.name)}`;

  // O próprio File vai para o Storage (com o tipo conferido), sem copiar o
  // arquivo inteiro para outro buffer no Worker.
  const { error } = await admin.storage.from(BUCKET).upload(path, new Blob([file], { type: contentType }), {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("[crm] falha no upload do anexo:", error.message);
    return { error: "Falha ao enviar o arquivo. Tente de novo." };
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, kind: check.kind };
}
