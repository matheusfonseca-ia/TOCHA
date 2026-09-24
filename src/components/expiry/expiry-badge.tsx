"use client";

import { Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { expiryLabel, expiryTone } from "@/lib/expiry/expiry";

const VARIANT = {
  normal: "muted",
  soon: "warning",
  expired: "destructive",
} as const;

/** "Expira em 2 dias" / "Expirada". Não renderiza nada quando é permanente. */
export function ExpiryBadge({
  expiresAt,
  expireAction,
}: {
  expiresAt: string | null | undefined;
  expireAction?: "delete" | "pause";
}) {
  const label = expiryLabel(expiresAt);
  const tone = expiryTone(expiresAt);
  if (!label || !tone) return null;

  const when = new Date(expiresAt!).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const title =
    tone === "expired"
      ? `Expirou em ${when}`
      : `${expireAction === "pause" ? "Pausa" : "Exclusão"} automática em ${when}`;

  return (
    <Badge variant={VARIANT[tone]} className="gap-1" title={title} suppressHydrationWarning>
      <Timer className="h-3 w-3" />
      <span suppressHydrationWarning>{label}</span>
    </Badge>
  );
}
