"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MessageSquareDashed, PanelRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { HandoffToggleButton } from "../../handoff/components/handoff-toggle-button";
import { NoteBubble } from "../../notes/components/note-bubble";
import type { CrmNote, InboxThread } from "../../shared/types/conversation";
import type { MessageRow } from "../../shared/types/message";
import { useComposer } from "../hooks/use-composer";
import { leadName, messagePreview } from "../utils/labels";
import { dayKey, dayLabel, windowStatus } from "../utils/time";
import { Composer, type ReplyDraft } from "./composer";
import { LeadAvatar } from "./lead-avatar";
import { MessageBubble, type QuotedMessage } from "./message-bubble";
import { PendingBubble } from "./pending-bubble";
import { StatusToggleButton } from "./status-toggle-button";

type TimelineItem =
  | { kind: "message"; at: string; message: MessageRow }
  | { kind: "note"; at: string; note: CrmNote };

export function Thread({
  thread,
  backHref,
  showAccount,
  onTogglePanel,
}: {
  thread: InboxThread;
  backHref: string;
  showAccount: boolean;
  onTogglePanel: () => void;
}) {
  const { conversation: c, messages } = thread;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const composer = useComposer(c.id);

  // Abre no fim da conversa; mensagem nova só rola sozinha se o usuário já
  // estava perto do fim (não arranca quem está lendo o histórico).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (lastCount.current === 0 || nearBottom) el.scrollTop = el.scrollHeight;
    lastCount.current = messages.length;
  }, [messages.length, c.id]);

  useLayoutEffect(() => setReplyTo(null), [c.id]);

  const quotes = useMemo(() => {
    const map = new Map<string, QuotedMessage>();
    for (const m of messages) {
      if (m.mid) map.set(m.mid, { text: messagePreview(m.kind, m.text), mine: m.direction === "outbound" });
    }
    return map;
  }, [messages]);

  // Notas internas intercaladas na conversa por horário (nunca vão para o Instagram).
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((message) => ({ kind: "message" as const, at: message.created_at, message })),
      ...thread.notes.map((note) => ({ kind: "note" as const, at: note.created_at, note })),
    ];
    return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }, [messages, thread.notes]);

  const win = windowStatus(c.last_inbound_at);
  const seenAt = c.contact_seen_at ? Date.parse(c.contact_seen_at) : 0;
  const name = leadName(c.ig_sender_username, c.ig_sender_id);

  function handleReply(message: MessageRow) {
    if (!message.mid) return;
    setReplyTo({ mid: message.mid, preview: messagePreview(message.kind, message.text), mine: message.direction === "outbound" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-1.5 border-b border-border/70 px-3 py-2.5 sm:px-4">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden">
          <Link href={backHref} aria-label="Voltar para a lista">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <LeadAvatar username={c.ig_sender_username} seed={c.ig_sender_id} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{name}</p>
          <p
            className={cn("truncate text-[12px]", win.open ? "text-emerald-700 dark:text-primary" : "text-muted-foreground")}
            suppressHydrationWarning
          >
            {win.label}
            {showAccount && c.account_username ? ` · em @${c.account_username}` : ""}
          </p>
        </div>
        <StatusToggleButton conversationId={c.id} status={c.status} />
        <HandoffToggleButton conversationId={c.id} takenOver={Boolean(c.human_takeover_at)} />
        {c.ig_sender_username && (
          <Button asChild variant="ghost" size="sm" className="hidden h-8 gap-1.5 text-[13px] sm:inline-flex">
            <a href={`https://www.instagram.com/${c.ig_sender_username}/`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Ver perfil
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 xl:hidden"
          onClick={onTogglePanel}
          aria-label="Ficha do lead"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {timeline.length === 0 && composer.pending.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
            <MessageSquareDashed className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhuma mensagem gravada nesta conversa</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              O Falow guarda as mensagens a partir de 28/09/2026. As próximas que chegarem ou saírem aparecem aqui na hora.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {thread.hasOlder && (
              <p className="pb-2 text-center text-[12px] text-muted-foreground">
                Mostrando as 100 mensagens mais recentes
              </p>
            )}
            {timeline.map((item, i) => {
              const newDay = i === 0 || dayKey(timeline[i - 1].at) !== dayKey(item.at);
              return (
                <Fragment key={item.kind === "message" ? item.message.id : `note-${item.note.id}`}>
                  {newDay && (
                    <div className="flex justify-center py-2">
                      <span
                        className="rounded-full bg-secondary/70 px-3 py-0.5 text-[11px] font-medium text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {dayLabel(item.at)}
                      </span>
                    </div>
                  )}
                  {item.kind === "note" ? (
                    <NoteBubble note={item.note} />
                  ) : (
                    <MessageBubble
                      message={item.message}
                      quoted={
                        item.message.reply_to_mid
                          ? quotes.get(item.message.reply_to_mid) ?? { text: "Mensagem citada", mine: false }
                          : null
                      }
                      seen={item.message.direction === "outbound" && seenAt >= Date.parse(item.message.created_at)}
                      onReply={handleReply}
                    />
                  )}
                </Fragment>
              );
            })}
            {composer.pending.map((p) => (
              <PendingBubble key={p.key} pending={p} onRetry={() => composer.retry(p.key)} onDismiss={() => composer.dismiss(p.key)} />
            ))}
          </div>
        )}
      </div>

      <Composer
        conversationId={c.id}
        accountId={c.account_id}
        windowOpen={win.open}
        quickReplies={thread.quickReplies}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSend={composer.send}
      />
    </div>
  );
}
