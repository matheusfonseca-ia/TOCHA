"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Mic, Paperclip, Settings2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { ManageQuickRepliesDialog } from "../../quick-replies/components/manage-quick-replies-dialog";
import { QuickReplyPicker } from "../../quick-replies/components/quick-reply-picker";
import type { QuickReply } from "../../shared/types/conversation";
import type { ComposerSendInput } from "../hooks/use-composer";
import { useVoiceRecorder } from "../hooks/use-voice-recorder";
import { COMPOSER_ACCEPT } from "../utils/attachment-types";

const MAX_TEXT = 1000;

export interface ReplyDraft {
  mid: string;
  preview: string;
  mine: boolean;
}

function draftKey(conversationId: string): string {
  return `falow:crm:draft:${conversationId}`;
}

function readDraft(conversationId: string): string {
  try {
    return localStorage.getItem(draftKey(conversationId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(conversationId: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(conversationId), text);
    else localStorage.removeItem(draftKey(conversationId));
  } catch {
    // localStorage indisponível (aba anônima, storage bloqueado): rascunho não persiste, sem quebrar o composer.
  }
}

/**
 * Composer do rodapé da conversa: texto, anexo (imagem/PDF), coração,
 * resposta rápida ("/") e citação. Desabilitado com a janela fechada.
 */
export function Composer({
  conversationId,
  accountId,
  windowOpen,
  quickReplies,
  replyTo,
  onClearReply,
  onSend,
}: {
  conversationId: string;
  accountId: string;
  windowOpen: boolean;
  quickReplies: QuickReply[];
  replyTo: ReplyDraft | null;
  onClearReply: () => void;
  onSend: (input: ComposerSendInput) => void;
}) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();

  // Rascunho por conversa: carrega ao trocar de conversa, salva a cada tecla.
  useEffect(() => {
    setText(readDraft(conversationId));
  }, [conversationId]);

  useEffect(() => {
    writeDraft(conversationId, text);
    setPickerOpen(text.startsWith("/"));
  }, [conversationId, text]);

  function reset() {
    setText("");
    writeDraft(conversationId, "");
    onClearReply();
  }

  function submitText() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed, replyToMid: replyTo?.mid ?? null });
    reset();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
    if (e.key === "Escape" && pickerOpen) setPickerOpen(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onSend({ file, replyToMid: replyTo?.mid ?? null });
    reset();
  }

  function handleHeart() {
    onSend({ heart: true, replyToMid: replyTo?.mid ?? null });
    onClearReply();
  }

  // Áudio gravado vai pelo mesmo caminho do anexo (upload + envio por URL).
  function sendRecording() {
    const file = recorder.stop();
    if (!file) return;
    onSend({ file, replyToMid: replyTo?.mid ?? null });
    onClearReply();
  }
  recorder.autoStop.current = sendRecording;

  if (!windowOpen) {
    return (
      <footer className="border-t border-border/70 px-4 py-3">
        <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
          Janela fechada: o Instagram só deixa responder até 24h depois da última mensagem do lead.
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border/70 px-3 py-2.5 sm:px-4">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-1.5 text-[12px]">
          <div className={cn("min-w-0 flex-1 border-l-2 pl-2", replyTo.mine ? "border-primary" : "border-muted-foreground/50")}>
            <p className="font-medium">Respondendo {replyTo.mine ? "você" : "o lead"}</p>
            <p className="line-clamp-1 text-muted-foreground">{replyTo.preview}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClearReply} aria-label="Cancelar citação">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {recorder.error && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-red-700 dark:text-red-400">
          <span>{recorder.error}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={recorder.clearError} aria-label="Fechar aviso">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="relative flex items-end gap-1.5">
        {pickerOpen && (
          <QuickReplyPicker
            replies={quickReplies}
            filter={text.slice(1)}
            onSelect={(r) => {
              setText(r.text);
              setPickerOpen(false);
              textareaRef.current?.focus();
            }}
          />
        )}

        <input ref={fileRef} type="file" accept={COMPOSER_ACCEPT} className="hidden" onChange={handleFile} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => fileRef.current?.click()}
          aria-label="Anexar imagem, PDF ou áudio"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {recorder.state === "recording" ? (
          <>
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 text-[13px]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden />
              <span className="font-medium tabular-nums">
                {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}
              </span>
              <span className="truncate text-muted-foreground">Gravando áudio</span>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={recorder.cancel} aria-label="Cancelar gravação">
              <X className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={sendRecording}>
              Enviar áudio
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                onKeyDown={handleKeyDown}
                placeholder='Escreva uma mensagem ("/" para respostas rápidas)'
                rows={1}
                className="max-h-32 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[14px] leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="mt-0.5 flex justify-end">
                <span className="text-[11px] text-muted-foreground">{text.length}/{MAX_TEXT}</span>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => void recorder.start()}
              aria-label="Gravar áudio"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleHeart} aria-label="Enviar coração">
              <Heart className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setManageOpen(true)}
              aria-label="Gerenciar respostas rápidas"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={submitText} disabled={!text.trim()}>
              Enviar
            </Button>
          </>
        )}
      </div>

      <ManageQuickRepliesDialog accountId={accountId} replies={quickReplies} open={manageOpen} onOpenChange={setManageOpen} />
    </footer>
  );
}
