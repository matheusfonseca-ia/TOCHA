import { cn } from "@/lib/utils";

import { TAG_COLOR_CLASSES } from "../utils/palette";
import type { TagColor } from "../types";

export function TagBadge({
  name,
  color,
  className,
}: {
  name: string;
  color: TagColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[140px] items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TAG_COLOR_CLASSES[color],
        className
      )}
      title={name}
    >
      {name}
    </span>
  );
}
