"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, CornerUpRight, MessagesSquare, Search, Settings2, Square, Tags, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { applyTagToLeadsBulk } from "../../tags/services/tags.actions";
import { TagBadge } from "../../tags/components/tag-badge";
import { TagFilter } from "../../tags/components/tag-filter";
import { TagManagerDialog } from "../../tags/components/tag-manager-dialog";
import type { CrmTag } from "../../tags/types";
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
  tagOptions,
}: {
  accounts: InboxAccount[];
  conversations: InboxConversation[];
  filters: InboxFilters;
  selectedId: string | null;
  error: string | null;
  tagOptions: CrmTag[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Busca com debounce: a lista é filtrada no servidor.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(inboxHref({ ...filters, q }, selectedId)), 350);
    return () => clearTimeout(t);
  }, [q, filters, selectedId, router]);

  useEffect(() => {
    setSelectionMode(false);
    setSelected(new Set());
  }, [conversations]);

  const multiAccount = accounts.length > 1;
  const managerAccountId = filters.accountId || accounts[0]?.id || "";
  const managerAccount = accounts.find((a) => a.id === managerAccountId);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkTag(tagName: string) {
    const targets = conversations
      .filter((c) => selected.has(c.id))
      .map((c) => ({ accountId: c.account_id, senderId: c.ig_sender_id, username: c.ig_sender_username }));
    if (targets.length === 0) return;
    const result = await applyTagToLeadsBulk(targets, tagName);
    if (result.error) toast.error(result.error);
    else toast.success(`Tag aplicada em ${result.applied} ${result.applied === 1 ? "conversa" : "conversas"}.`);
    setSelectionMode(false);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border/70 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-lg font-semibold">Conversas</h1>
          <div className="flex items-center gap-1">
            {conversations.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setSelectionMode((v) => !v);
                  setSelected(new Set());
                }}
                aria-label={selectionMode ? "Cancelar seleção" : "Selecionar conversas"}
                title={selectionMode ? "Cancelar seleção" : "Selecionar conversas"}
              >
                {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              </Button>
            )}
            {managerAccountId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setManagerOpen(true)}
                aria-label="Gerenciar tags"
                title="Gerenciar tags"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

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

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-1">
            {[
              { label: "Todas", unreadOnly: false },
              { label: "Não lidas", unreadOnly: true },
            ].map((o) => (
              <Link
                key={o.label}
                href={inboxHref({ ...filters, unreadOnly: o.unreadOnly }, selectedId)}
                replace
                prefetch={false}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  filters.unreadOnly === o.unreadOnly
                    ? "bg-secondary text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.3)]"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>

          <TagFilter
            tags={tagOptions}
            value={filters.tag ?? ""}
            onChange={(tag) => router.replace(inboxHref({ ...filters, tag }, selectedId))}
          />
        </div>

        {selectionMode && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-[12px] font-medium">
              {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[12px]" disabled={selected.size === 0}>
                  <Tags className="h-3.5 w-3.5" />
                  Aplicar tag
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {tagOptions.length === 0 ? (
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    Crie uma tag no gerenciador
                  </DropdownMenuLabel>
                ) : (
                  tagOptions.map((tag) => (
                    <DropdownMenuItem key={tag.id} onSelect={() => void applyBulkTag(tag.name)}>
                      {tag.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
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
              {filters.q || filters.unreadOnly || filters.tag ? "Nada encontrado" : "Nenhuma conversa ainda"}
            </p>
            <p className="mt-1 max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">
              {filters.q || filters.unreadOnly || filters.tag
                ? "Tente outro filtro ou volte para todas as conversas."
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
                  selectionMode={selectionMode}
                  selected={selected.has(c.id)}
                  onToggleSelected={() => toggleSelected(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {managerAccountId && (
        <TagManagerDialog
          open={managerOpen}
          onOpenChange={setManagerOpen}
          accountId={managerAccountId}
          accountUsername={managerAccount?.ig_username ?? null}
        />
      )}
    </div>
  );
}

function ConversationItem({
  conversation: c,
  href,
  active,
  showAccount,
  selectionMode,
  selected,
  onToggleSelected,
}: {
  conversation: InboxConversation;
  href: string;
  active: boolean;
  showAccount: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const unread = c.unread_count > 0;
  const when = c.last_message_at ?? c.last_inbound_at ?? c.created_at;
  const preview = c.last_message_at
    ? messagePreview(c.last_message_kind, c.last_message_text)
    : "Sem mensagens gravadas";

  const content = (
    <>
      {selectionMode && (
        <span className="shrink-0 text-muted-foreground">
          {selected ? <CheckSquare className="h-[18px] w-[18px] text-primary" /> : <Square className="h-[18px] w-[18px]" />}
        </span>
      )}
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
        {(c.tags?.length ?? 0) > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.tags!.map((t) => (
              <TagBadge key={t.name} name={t.name} color={t.color} className="py-0" />
            ))}
          </div>
        )}
        {showAccount && c.account_username && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">em @{c.account_username}</p>
        )}
      </div>
    </>
  );

  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelected}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          selected ? "bg-secondary/80" : "hover:bg-secondary/40"
        )}
      >
        {content}
      </button>
    );
  }

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
      {content}
    </Link>
  );
}
