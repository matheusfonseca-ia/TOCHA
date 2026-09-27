"use client";

import { TriangleAlert } from "lucide-react";

import { useNodeDataChange } from "@/components/sequences/node-data-context";
import type { GoToSequenceNodeData } from "@/types/sequence";

import { useGoToSequenceOptions } from "./go-to-sequence-context";
import { GoToSequenceForm } from "./go-to-sequence-form";

/** Resumo somente-leitura do card do nó "Ir para workflow" no canvas. */
function GoToSequenceNodeBody({ sequenceId }: { sequenceId: string }) {
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

/**
 * Conteúdo do nó "Ir para workflow": resumo de costume, ou o formulário
 * completo dentro do próprio card quando ele está selecionado.
 */
export function GoToSequenceNodeContent({
  id,
  data,
  selected,
}: {
  id: string;
  data: GoToSequenceNodeData;
  selected?: boolean;
}) {
  const { options } = useGoToSequenceOptions();
  const onNodeDataChange = useNodeDataChange();

  if (!selected) return <GoToSequenceNodeBody sequenceId={data.sequenceId} />;

  return (
    <GoToSequenceForm
      data={data}
      onChange={(next) => onNodeDataChange(id, next)}
      options={options}
    />
  );
}
