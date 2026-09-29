"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerUpRight, MessagesSquare, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { InboxAccount, InboxConversation, InboxFilters } from "../../shared/types/conversation";
import { inboxHref } from "../utils/href";
import { leadName, messagePreview } from "../utils/labels";
import { listTime } from "../utils/time";
import { LeadAvatar } from "./lead-avatar";

const ALL_ACCOUNTS = "todas";

export function ConversationList({
  accounts,
  conversations,
  filters,
  selectedId,
  error,
}: {
  accounts: InboxAccount[];
  conversations: InboxConversation[];
  filters: InboxFilters;
  selectedId: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  // Busca com debounce: a lista é filtrada no servidor.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(inboxHref({ ...filters, q }, selectedId)), 350);
    return () => clearTimeout(t);
  }, [q, filters, selectedId, router]);

  const multiAccount = accounts.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border/70 px-4 pb-3 pt-4">
        <h1 className="font-display text-lg font-semibold">Conversas</h1>

        {multiAccount && (
          <Select
            value={filters.accountId || ALL_ACCOUNTS}
            onValueChange={(v) =>
              router.replace(inboxHref({ ...filters, accountId: v === ALL_ACCOUNTS ? "" : v }))
            }
          >
            <SelectTrigger className="h-9 text-[13px]" aria-label="Conta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS}>Todas as contas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  @{a.ig_username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <label className="relative block">
          <span className="sr-only">Buscar por @ ou mensagem</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por @ ou mensagem"
            className="h-9 pl-9 text-[13px]"
          />
        </label>

        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-1">
          {(
            [
              { label: "Abertas", status: "open" },
              { label: "Não lidas", status: "unread" },
              { label: "Concluídas", status: "done" },
            ] as const
          ).map((o) => (
            <Link
              key={o.label}
              href={inboxHref({ ...filters, status: o.status }, selectedId)}
              replace
              prefetch={false}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filters.status === o.status
                  ? "bg-secondary text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.3)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            Não foi possível carregar as conversas. Recarregue a página.
          </p>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <MessagesSquare className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {filters.q || filters.status !== "open" ? "Nada encontrado" : "Nenhuma conversa ainda"}
            </p>
            <p className="mt-1 max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">
              {filters.q || filters.status !== "open"
                ? "Tente outra busca ou outro filtro."
                : "Quando alguém mandar DM para a sua conta, a conversa aparece aqui."}
            </p>
          </div>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <ConversationItem
                  conversation={c}
                  href={inboxHref(filters, c.id)}
                  active={c.id === selectedId}
                  showAccount={multiAccount && !filters.accountId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation: c,
  href,
  active,
  showAccount,
}: {
  conversation: InboxConversation;
  href: string;
  active: boolean;
  showAccount: boolean;
}) {
  const unread = c.unread_count > 0;
  const when = c.last_message_at ?? c.last_inbound_at ?? c.created_at;
  const preview = c.last_message_at
    ? messagePreview(c.last_message_kind, c.last_message_text)
    : "Sem mensagens gravadas";

  return (
    // Sem prefetch: com dezenas de conversas visíveis, o Next renderizaria
    // cada uma no servidor ao carregar a lista (derrubou o Worker com 503).
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        active ? "bg-secondary/80" : "hover:bg-secondary/40"
      )}
    >
      <LeadAvatar username={c.ig_sender_username} seed={c.ig_sender_id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("truncate text-[14px]", unread ? "font-semibold" : "font-medium")}>
            {leadName(c.ig_sender_username, c.ig_sender_id)}
          </p>
          <span
            className={cn("shrink-0 text-[11px]", unread ? "font-semibold text-foreground" : "text-muted-foreground")}
            suppressHydrationWarning
          >
            {listTime(when)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 truncate text-[13px]",
              unread ? "text-foreground" : "text-muted-foreground",
              !c.last_message_at && "italic"
            )}
          >
            {c.last_message_direction === "outbound" && (
              <CornerUpRight className="h-3.5 w-3.5 shrink-0" aria-label="Enviada" />
            )}
            <span className="truncate">{preview}</span>
          </p>
          {unread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>
        {showAccount && c.account_username && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">em @{c.account_username}</p>
        )}
      </div>
    </Link>
  );
}
