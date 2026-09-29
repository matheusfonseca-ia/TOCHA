"use client";

import { Zap } from "lucide-react";

import type { QuickReply } from "../../shared/types/conversation";

/**
 * Lista filtrável que abre quando o composer começa com "/". Selecionar um
 * item preenche o texto (não envia sozinho).
 */
export function QuickReplyPicker({
  replies,
  filter,
  onSelect,
}: {
  replies: QuickReply[];
  filter: string;
  onSelect: (reply: QuickReply) => void;
}) {
  const term = filter.trim().toLowerCase();
  const filtered = term
    ? replies.filter((r) => r.title.toLowerCase().includes(term) || r.text.toLowerCase().includes(term))
    : replies;

  return (
    <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-sm overflow-hidden rounded-lg border border-border/70 bg-popover shadow-xl">
      <div className="max-h-56 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">
            {replies.length === 0 ? "Nenhuma resposta rápida cadastrada ainda." : "Nada encontrado."}
          </p>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => {
                // mousedown (não click) para não perder o foco do textarea antes do onSelect.
                e.preventDefault();
                onSelect(r);
              }}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[13px] hover:bg-accent"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Zap className="h-3 w-3 shrink-0 text-primary" />/{r.title}
              </span>
              <span className="line-clamp-1 text-[12px] text-muted-foreground">{r.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
