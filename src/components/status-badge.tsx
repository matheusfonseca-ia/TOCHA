import { Badge } from "@/components/ui/badge";
import type { InteractionStatus } from "@/types/database";

const STATUS_MAP: Record<
  InteractionStatus,
  { label: string; variant: "success" | "muted" | "warning" | "destructive" }
> = {
  replied: { label: "Respondida", variant: "success" },
  no_match: { label: "Sem match", variant: "muted" },
  duplicate_skip: { label: "Duplicada (pulada)", variant: "warning" },
  window_expired: { label: "Fora da janela 24h", variant: "warning" },
  error: { label: "Erro", variant: "destructive" },
};

export function StatusBadge({ status }: { status: InteractionStatus }) {
  const config = STATUS_MAP[status] ?? { label: status, variant: "muted" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
