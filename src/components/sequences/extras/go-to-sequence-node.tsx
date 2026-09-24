"use client";

import { TriangleAlert } from "lucide-react";

import { useGoToSequenceOptions } from "./go-to-sequence-context";

/** Conteúdo do card do nó "Ir para workflow" no canvas. */
export function GoToSequenceNodeBody({ sequenceId }: { sequenceId: string }) {
  const { optionsById } = useGoToSequenceOptions();
  const target = sequenceId ? optionsById.get(sequenceId) : undefined;

  if (!sequenceId) {
    return (
      <p className="text-xs italic text-muted-foreground/70">
        Escolha o workflow de destino…
      </p>
    );
  }
  if (!target) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Workflow removido. Escolha outro.</span>
      </div>
    );
  }
  return (
    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
      Vai para{" "}
      <span className="font-medium text-foreground">{target.name}</span>
    </p>
  );
}
