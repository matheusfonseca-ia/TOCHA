"use client";

import { Handle, Position } from "@xyflow/react";

import { cn } from "@/lib/utils";

/**
 * Linha de saída nomeada dentro do card (ex.: "sim" / "não"), com o handle
 * na borda direita. A classe do handle vem de sequence-nodes.tsx para ficar
 * igual à dos botões e respostas rápidas.
 */
export function OutputRow({
  handleId,
  handleClassName,
  label,
  tone = "default",
}: {
  handleId: string;
  handleClassName: string;
  label: string;
  tone?: "default" | "muted";
}) {
  return (
    <div
      className={cn(
        "relative flex items-center rounded-md px-2 py-1",
        tone === "default"
          ? "border border-border/70 bg-secondary/40"
          : "border border-dashed border-border/70"
      )}
    >
      <span
        className={cn(
          "truncate text-xs",
          tone === "muted" && "italic text-muted-foreground"
        )}
      >
        {label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={handleId}
        className={handleClassName}
      />
    </div>
  );
}
