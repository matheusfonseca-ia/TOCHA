"use client";

import { NO_HANDLE, YES_HANDLE, type ConditionNodeData } from "@/types/sequence";

import { operatorLabel } from "./labels";
import { OutputRow } from "./output-row";

/** "Se {plano} é igual a pro", "Se tem a tag vip". */
function ConditionSummary({ data }: { data: ConditionNodeData }) {
  if (data.operator === "hasTag") {
    return data.value.trim() ? (
      <>
        Se tem a tag <span className="font-medium text-foreground">{data.value}</span>
      </>
    ) : (
      <span className="italic text-muted-foreground/70">Informe a tag…</span>
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

/** Conteúdo do card "Condição" (a moldura é o NodeFrame de sequence-nodes.tsx). */
export function ConditionNodeBody({
  data,
  handleClassName,
}: {
  data: ConditionNodeData;
  handleClassName: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="break-words text-xs text-muted-foreground">
        <ConditionSummary data={data} />
      </p>
      <OutputRow handleId={YES_HANDLE} handleClassName={handleClassName} label="Sim" />
      <OutputRow handleId={NO_HANDLE} handleClassName={handleClassName} label="Não" />
    </div>
  );
}
