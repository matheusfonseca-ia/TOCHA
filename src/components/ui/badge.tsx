import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-[#c4b5fd]",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-success/25 bg-success/10 text-emerald-300",
        warning: "border-warning/25 bg-warning/10 text-amber-300",
        destructive: "border-destructive/25 bg-destructive/10 text-red-300",
        outline: "border-border text-muted-foreground",
        muted: "border-border/70 bg-secondary/40 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
