import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  index?: number;
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  index = 0,
}: MetricCardProps) {
  return (
    <Card
      className="stagger-item"
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </div>
        <p className="mt-3 font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </p>
        {hint && (
          <p className="mt-2 text-xs text-muted-foreground/70">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
