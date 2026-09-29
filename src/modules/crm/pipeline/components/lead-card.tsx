"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { LeadAvatar } from "@/modules/crm/inbox/components/lead-avatar";
import { leadName, messagePreview } from "@/modules/crm/inbox/utils/labels";
import { listTime } from "@/modules/crm/inbox/utils/time";

import type { BoardLeadCard } from "../types";

const CURRENCY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Card do lead no board: mesma identidade visual do item da lista do Inbox. */
export function LeadCard({ card, onOpen }: { card: BoardLeadCard; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const unread = card.unread_count > 0;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
      className={cn(
        "w-full space-y-2 rounded-lg border border-border/70 bg-background p-3 text-left shadow-sm transition-colors",
        "hover:border-border hover:bg-secondary/30",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-center gap-2">
        <LeadAvatar username={card.ig_sender_username} seed={card.ig_sender_id} className="h-7 w-7 text-[11px]" />
        <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-semibold" : "font-medium")}>
          {leadName(card.ig_sender_username, card.ig_sender_id)}
        </p>
        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
      </div>

      <p className="truncate text-[12px] text-muted-foreground">
        {card.last_message_text || card.last_message_kind
          ? messagePreview(card.last_message_kind, card.last_message_text)
          : "Sem mensagens gravadas"}
      </p>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span suppressHydrationWarning>Na etapa desde {listTime(card.entered_stage_at)}</span>
        {card.value != null && <span className="font-medium text-foreground">{CURRENCY.format(card.value)}</span>}
      </div>
    </button>
  );
}
