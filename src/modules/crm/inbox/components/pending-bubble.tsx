"use client";

import { Loader2, RotateCw, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import type { PendingMessage } from "../hooks/use-composer";
import { kindLabel } from "../utils/labels";

/** Balão otimista: aparece na hora do envio, some quando confirmado. */
export function PendingBubble({
  pending,
  onRetry,
  onDismiss,
}: {
  pending: PendingMessage;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const label = pending.kind === "sticker" ? "❤️" : pending.text || kindLabel(pending.kind);

  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[14px] leading-relaxed sm:max-w-[75%]",
          pending.failed ? "border border-destructive/40 bg-destructive/10" : "bg-primary/10 dark:bg-primary/15"
        )}
      >
        <p className="whitespace-pre-wrap break-words opacity-80">{label}</p>
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px]">
          {pending.failed ? (
            <>
              <span className="text-destructive">{pending.error ?? "Falhou ao enviar"}</span>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] text-destructive hover:text-destructive" onClick={onRetry}>
                <RotateCw className="h-3 w-3" />
                Tentar de novo
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDismiss} aria-label="Descartar">
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enviando…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
