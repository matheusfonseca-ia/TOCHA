"use client";

import { useNodeDataChange } from "@/components/sequences/node-data-context";
import { usePipelineStageOptions } from "@/modules/crm/pipeline/components/workflow";
import { NO_HANDLE, YES_HANDLE, type ConditionNodeData } from "@/types/sequence";

import { ConditionForm } from "./condition-form";
import { operatorLabel } from "./labels";
import { OutputRow } from "./output-row";

/** "Se {plano} é igual a pro", "Se tem a tag vip", "Se está na etapa Novos". */
function ConditionSummary({ data }: { data: ConditionNodeData }) {
  const { optionsById } = usePipelineStageOptions();
  if (data.operator === "hasTag") {
    return data.value.trim() ? (
      <>
        Se tem a tag <span className="font-medium text-foreground">{data.value}</span>
      </>
    ) : (
      <span className="italic text-muted-foreground/70">Informe a tag…</span>
    );
  }
  if (data.operator === "inStage") {
    const stage = optionsById.get(data.value);
    return stage ? (
      <>
        Se está na etapa{" "}
        <span className="font-medium text-foreground">
          {stage.pipelineName} · {stage.name}
        </span>
      </>
    ) : (
      <span className="italic text-muted-foreground/70">Escolha a etapa…</span>
    );
  }
  if (!data.fieldKey) {
    return <span className="italic text-muted-foreground/70">Escolha o campo…</span>;
  }
  return (
    <>
      Se <span className="font-mono font-medium text-foreground">{`{${data.fieldKey}}`}</span>{" "}
      {operatorLabel(data.operator)}
      {data.operator !== "exists" && (
        <>
          {" "}
          <span className="font-medium text-foreground">
            {data.value.trim() || "…"}
          </span>
        </>
      )}
    </>
  );
}

/**
 * Conteúdo do card "Condição" (a moldura é o NodeFrame de sequence-nodes.tsx).
 * As saídas "sim"/"não" são fixas — ficam sempre visíveis, editado ou não,
 * pra nunca perder a conexão delas.
 */
export function ConditionNodeContent({
  id,
  data,
  selected,
  handleClassName,
}: {
  id: string;
  data: ConditionNodeData;
  selected?: boolean;
  handleClassName: string;
}) {
  const onNodeDataChange = useNodeDataChange();

  return (
    <div className="space-y-1.5">
      {selected ? (
        <ConditionForm data={data} onChange={(next) => onNodeDataChange(id, next)} />
      ) : (
        <p className="break-words text-xs text-muted-foreground">
          <ConditionSummary data={data} />
        </p>
      )}
      <OutputRow handleId={YES_HANDLE} handleClassName={handleClassName} label="Sim" />
      <OutputRow handleId={NO_HANDLE} handleClassName={handleClassName} label="Não" />
    </div>
  );
}
