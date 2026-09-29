"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MessageKind } from "../../shared/types/message";
import { sendMessage, uploadComposerAttachment } from "../services/composer.actions";

export interface ComposerSendInput {
  text?: string;
  file?: File;
  replyToMid?: string | null;
  heart?: boolean;
}

export interface PendingMessage {
  key: string;
  input: ComposerSendInput;
  text: string | null;
  kind: Extract<MessageKind, "text" | "image" | "audio" | "file" | "sticker">;
  failed: boolean;
  error: string | null;
}

/**
 * Envio otimista do composer: a mensagem aparece na hora com "Enviando...",
 * vira de verdade quando o Realtime trouxer o eco/registro, ou mostra
 * "Falhou, tentar de novo" se o envio der erro.
 */
export function useComposer(conversationId: string) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const seq = useRef(0);

  const attempt = useCallback(
    async (key: string, input: ComposerSendInput) => {
      try {
        let attachmentUrl: string | undefined;
        let attachmentKind: "image" | "audio" | "file" | undefined;
        if (input.file) {
          const form = new FormData();
          form.set("conversationId", conversationId);
          form.set("file", input.file);
          const uploaded = await uploadComposerAttachment(form);
          if ("error" in uploaded) throw new Error(uploaded.error);
          attachmentUrl = uploaded.url;
          attachmentKind = uploaded.kind;
        }

        const result = await sendMessage(conversationId, {
          text: input.text,
          attachmentUrl,
          attachmentKind,
          replyToMid: input.replyToMid ?? null,
          heart: input.heart,
        });
        if ("error" in result) throw new Error(result.error);

        setPending((list) => list.filter((m) => m.key !== key));
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Não foi possível enviar.";
        setPending((list) => list.map((m) => (m.key === key ? { ...m, failed: true, error: message } : m)));
      }
    },
    [conversationId, router]
  );

  const send = useCallback(
    (input: ComposerSendInput) => {
      const key = `pending-${Date.now()}-${seq.current++}`;
      const kind: PendingMessage["kind"] = input.heart
        ? "sticker"
        : input.file
          ? input.file.type.startsWith("image/")
            ? "image"
            : input.file.type.startsWith("audio/") || /.(m4a|wav)$/i.test(input.file.name)
              ? "audio"
              : "file"
          : "text";
      setPending((list) => [
        ...list,
        {
          key,
          input,
          text: input.heart ? null : input.text?.trim() || (input.file ? input.file.name : null),
          kind,
          failed: false,
          error: null,
        },
      ]);
      void attempt(key, input);
    },
    [attempt]
  );

  const retry = useCallback(
    (key: string) => {
      setPending((list) => list.map((m) => (m.key === key ? { ...m, failed: false, error: null } : m)));
      const item = pending.find((m) => m.key === key);
      if (item) void attempt(key, item.input);
    },
    [attempt, pending]
  );

  const dismiss = useCallback((key: string) => {
    setPending((list) => list.filter((m) => m.key !== key));
  }, []);

  return { pending, send, retry, dismiss };
}
