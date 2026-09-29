"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LeadCard } from "./lead-card";
import type { BoardLeadCard } from "../types";

const CURRENCY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function BoardColumn({
  stageId,
  name,
  color,
  cards,
  count,
  valueSum,
  hasMore,
  loadingMore,
  onOpenCard,
  onLoadMore,
}: {
  stageId: string;
  name: string;
  color: string;
  cards: BoardLeadCard[];
  count: number;
  valueSum: number;
  hasMore: boolean;
  loadingMore: boolean;
  onOpenCard: (id: string) => void;
  onLoadMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <p className="truncate text-[13px] font-semibold">{name}</p>
          <span className="shrink-0 rounded-full bg-secondary px-1.5 text-[11px] text-muted-foreground">{count}</span>
        </div>
        {valueSum > 0 && <span className="shrink-0 text-[11px] text-muted-foreground">{CURRENCY.format(valueSum)}</span>}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12px] text-muted-foreground/70">Nenhum lead nesta etapa</p>
          ) : (
            cards.map((card) => <LeadCard key={card.id} card={card} onOpen={onOpenCard} />)
          )}
        </SortableContext>

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-[12px] text-muted-foreground"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}
