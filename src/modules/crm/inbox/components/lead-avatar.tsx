import { cn } from "@/lib/utils";

import { leadInitials } from "../utils/labels";

/**
 * Avatar por iniciais: a foto de perfil da Meta vem com URL que expira, então
 * o Inbox não depende dela. O tom varia pelo @ para diferenciar leads na lista.
 */
const TONES = [
  "bg-primary/15 text-emerald-800 dark:text-emerald-300",
  "bg-secondary text-secondary-foreground",
  "bg-warning/20 text-amber-800 dark:text-amber-300",
  "bg-accent text-accent-foreground",
];

function toneFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function LeadAvatar({
  username,
  seed,
  className,
}: {
  username: string | null;
  seed: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-semibold",
        toneFor(seed),
        className
      )}
    >
      {leadInitials(username)}
    </div>
  );
}
