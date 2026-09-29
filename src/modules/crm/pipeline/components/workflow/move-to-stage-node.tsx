"use client";

import { TriangleAlert } from "lucide-react";

import { useNodeDataChange } from "@/components/sequences/node-data-context";
import type { MoveToStageNodeData } from "@/types/sequence";

import { usePipelineStageOptions } from "./pipeline-stage-context";
import { MoveToStageForm } from "./move-to-stage-form";

/** Resumo somente-leitura do card "Mover para etapa" no canvas. */
function MoveToStageNodeBody({ stageId }: { stageId: string }) {
  const { optionsById } = usePipelineStageOptions();
  const target = stageId ? optionsById.get(stageId) : undefined;

  if (!stageId) {
    return <p className="text-xs italic text-muted-foreground/70">Escolha a etapa de destino…</p>;
  }
  if (!target) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Etapa removida. Escolha outra.</span>
      </div>
    );
  }
  return (
    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
      Move para{" "}
      <span className="font-medium text-foreground">
        {target.pipelineName} · {target.name}
      </span>
    </p>
  );
}

/** Conteúdo do card "Mover para etapa": resumo, ou formulário quando selecionado. */
export function MoveToStageNodeContent({
  id,
  data,
  selected,
}: {
  id: string;
  data: MoveToStageNodeData;
  selected?: boolean;
}) {
  const { options } = usePipelineStageOptions();
  const onNodeDataChange = useNodeDataChange();

  if (!selected) return <MoveToStageNodeBody stageId={data.stageId} />;

  return <MoveToStageForm data={data} onChange={(next) => onNodeDataChange(id, next)} options={options} />;
}
