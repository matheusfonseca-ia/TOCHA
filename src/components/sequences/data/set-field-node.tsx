"use client";

import { useNodeDataChange } from "@/components/sequences/node-data-context";
import type { SetFieldNodeData } from "@/types/sequence";

import { SetFieldForm } from "./set-field-form";

/** Resumo somente-leitura do card "Definir campo". */
function SetFieldSummary({ data }: { data: SetFieldNodeData }) {
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

/**
 * Conteúdo do card "Definir campo": resumo de costume, ou o formulário
 * completo dentro do próprio card quando ele está selecionado.
 */
export function SetFieldNodeContent({
  id,
  data,
  selected,
}: {
  id: string;
  data: SetFieldNodeData;
  selected?: boolean;
}) {
  const onNodeDataChange = useNodeDataChange();

  if (!selected) return <SetFieldSummary data={data} />;

  return <SetFieldForm data={data} onChange={(next) => onNodeDataChange(id, next)} />;
}
