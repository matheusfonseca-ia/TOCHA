"use client";

import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  InboxAccount,
  InboxConversation,
  InboxFilters,
  InboxThread,
} from "../../shared/types/conversation";
import { useInboxRealtime } from "../hooks/use-inbox-realtime";
import { markConversationRead } from "../services/inbox.actions";
import { inboxHref } from "../utils/href";
import { ContactPanel } from "./contact-panel";
import { ConversationList } from "./conversation-list";
import { Thread } from "./thread";

/**
 * Inbox em tela cheia (mesmo recurso do editor de Workflow): lista, conversa
 * e ficha do lead lado a lado. No celular vira uma tela por vez; a conversa
 * aberta vem de `?c=` na URL.
 */
export function InboxShell({
  accounts,
  conversations,
  listError,
  filters,
  thread,
}: {
  accounts: InboxAccount[];
  conversations: InboxConversation[];
  listError: string | null;
  filters: InboxFilters;
  thread: InboxThread | null;
}) {
  useInboxRealtime();
  const [panelOpen, setPanelOpen] = useState(false);
  const selectedId = thread?.conversation.id ?? null;
  const unread = thread?.conversation.unread_count ?? 0;

  useEffect(() => setPanelOpen(false), [selectedId]);

  // Conversa aberta = lida, inclusive quando chega mensagem nova com ela aberta.
  useEffect(() => {
    if (selectedId && unread > 0) void markConversationRead(selectedId);
  }, [selectedId, unread]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex bg-background md:left-60 md:top-0">
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-border/70 md:flex md:w-[320px] lg:w-[340px]",
          thread ? "hidden" : "flex"
        )}
      >
        <ConversationList
          accounts={accounts}
          conversations={conversations}
          filters={filters}
          selectedId={selectedId}
          error={listError}
        />
      </aside>

      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", thread ? "flex" : "hidden md:flex")}>
        {thread ? (
          <Thread
            thread={thread}
            backHref={inboxHref(filters)}
            showAccount={accounts.length > 1}
            onTogglePanel={() => setPanelOpen((v) => !v)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-secondary/40">
              <MessagesSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-4 font-display text-[15px] font-semibold">Escolha uma conversa</p>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              As DMs da sua conta chegam aqui ao vivo, com as respostas das automações e dos workflows.
            </p>
          </div>
        )}
      </section>

      {thread && <ContactPanel thread={thread} open={panelOpen} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
