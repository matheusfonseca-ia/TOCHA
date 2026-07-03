import { cn } from "@/lib/utils";
import type { InteractionStatus } from "@/types/database";

const STATUS_MAP: Record<InteractionStatus, { label: string; dot: string }> = {
  replied: { label: "Respondida", dot: "bg-emerald-400" },
  no_match: { label: "Sem match", dot: "bg-muted-foreground/40" },
  duplicate_skip: { label: "Duplicada", dot: "bg-amber-400" },
  window_expired: { label: "Janela 24h", dot: "bg-amber-400" },
  error: { label: "Erro", dot: "bg-red-400" },
};

export function StatusBadge({ status }: { status: InteractionStatus }) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    dot: "bg-muted-foreground/40",
  };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
