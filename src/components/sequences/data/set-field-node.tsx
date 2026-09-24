"use client";

import type { SetFieldNodeData } from "@/types/sequence";

/** Conteúdo do card "Definir campo" (a moldura é o NodeFrame de sequence-nodes.tsx). */
export function SetFieldNodeBody({ data }: { data: SetFieldNodeData }) {
  if (data.mode === "tag") {
    if (!data.value.trim()) {
      return <p className="text-xs italic text-muted-foreground/70">Informe a tag…</p>;
    }
    return (
      <p className="break-words text-xs text-muted-foreground">
        {data.tagAction === "remove" ? "Remover a tag " : "Adicionar a tag "}
        <span className="font-medium text-foreground">{data.value}</span>
      </p>
    );
  }
  if (!data.fieldKey) {
    return <p className="text-xs italic text-muted-foreground/70">Escolha o campo…</p>;
  }
  return (
    <p className="break-words text-xs text-muted-foreground">
      Definir{" "}
      <span className="font-mono font-medium text-foreground">{`{${data.fieldKey}}`}</span>{" "}
      como{" "}
      <span className="font-medium text-foreground">
        {data.value.trim() ? data.value : "vazio"}
      </span>
    </p>
  );
}
