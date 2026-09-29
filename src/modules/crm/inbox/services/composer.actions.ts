"use server";

import { randomUUID } from "node:crypto";

import {
  GraphApiError,
  sendAttachmentMessage,
  sendLikeHeartSticker,
  sendTextMessage,
  type AttachmentKind,
} from "@/lib/meta/graph";
import { getFreshToken } from "@/lib/meta/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { classifyUpload, type UploadKind } from "../utils/attachment-types";
import { observeOutbound } from "@/modules/crm/server";

import { setTakeover } from "../../handoff/server/takeover";

const MAX_TEXT = 1000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const BUCKET = "crm-uploads";

interface ConversationOwner {
  id: string;
  account_id: string;
  ig_sender_id: string;
  last_inbound_at: string | null;
}

/** Confere a posse da conversa com o client do usuário (RLS). */
async function ownConversation(conversationId: string): Promise<ConversationOwner | null> {
  const { data } = await createClient()
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
  if (err instanceof GraphApiError) {
    if (err.code === 10 && err.subcode === 2018278) return WINDOW_CLOSED_MESSAGE;
    if (err.code === 190) return "O token desta conta expirou. Reconecte a conta do Instagram.";
    return `Não foi possível enviar: ${err.message}`;
  }
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
  const conversation = await ownConversation(conversationId);
  if (!conversation) return { error: "Conversa não encontrada." };
  if (!isWindowOpen(conversation.last_inbound_at)) return { error: WINDOW_CLOSED_MESSAGE };

  const text = input.text?.trim().slice(0, MAX_TEXT) || "";
  if (!text && !input.attachmentUrl && !input.heart) return { error: "Nada para enviar." };

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("id", conversation.account_id)
    .maybeSingle<IgAccount>();
  if (!account) return { error: "Conta desconectada." };

  const {
    data: { user },
  } = await createClient().auth.getUser();

  let attachmentSent = false;
  try {
    const token = await getFreshToken(admin, account);
    const opts = { replyToMid: input.replyToMid ?? undefined };

    await observeOutbound(
      { accountId: account.id, source: "agent", sentBy: user?.id ?? null },
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

/**
 * Sobe o anexo pra o bucket público `crm-uploads` (arquivo do usuário, não
 * da Meta) e devolve a URL pública para o envio.
 */
export async function uploadComposerAttachment(formData: FormData): Promise<UploadAttachmentResult> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const file = formData.get("file");
  if (!conversationId || !(file instanceof File)) return { error: "Arquivo inválido." };

  const conversation = await ownConversation(conversationId);
  if (!conversation) return { error: "Conversa não encontrada." };

  const check = classifyUpload(file.type, file.size, file.name);
  if ("error" in check) return { error: check.error };

  const admin = createAdminClient();
  const path = `${conversation.account_id}/${randomUUID()}-${sanitizeFileName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: check.contentType,
    upsert: false,
  });
  if (error) return { error: "Falha ao enviar o arquivo. Tente de novo." };

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, kind: check.kind };
}
