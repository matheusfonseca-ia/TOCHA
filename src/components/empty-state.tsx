import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: EmptyStateProps) {
  return (
    <Card className="animate-fade-up">
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-secondary/40">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 font-display text-[15px] font-semibold">{title}</h2>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {children && <div className="mt-5">{children}</div>}
      </CardContent>
    </Card>
  );
}
