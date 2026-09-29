"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MoveToStageNodeData } from "@/types/sequence";

import type { PipelineStageOption } from "./pipeline-stage-context";

/** Formulário do card "Mover para etapa" (nó do editor). */
export function MoveToStageForm({
  data,
  onChange,
  options,
}: {
  data: MoveToStageNodeData;
  onChange: (d: MoveToStageNodeData) => void;
  options: PipelineStageOption[];
}) {
  return (
    <div className="space-y-4">
      <Select value={data.stageId || ""} onValueChange={(v) => onChange({ ...data, stageId: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Escolha a etapa de destino" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum funil com etapas ainda.</p>
          )}
          {options.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.pipelineName} · {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Move o contato para esta etapa do funil (cria o lead se ele ainda não
        estiver em nenhuma etapa aberta). Se a etapa tiver um workflow
        configurado para "ao entrar", ele começa em seguida.
      </p>
    </div>
  );
}
