"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GoToSequenceNodeData } from "@/types/sequence";

import type { GoToSequenceOption } from "./go-to-sequence-context";

/** Formulário do inspector para o nó "Ir para workflow". */
export function GoToSequenceForm({
  data,
  onChange,
  options,
}: {
  data: GoToSequenceNodeData;
  onChange: (d: GoToSequenceNodeData) => void;
  options: GoToSequenceOption[];
}) {
  return (
    <div className="space-y-4">
      <Select
        value={data.sequenceId || ""}
        onValueChange={(v) => onChange({ ...data, sequenceId: v })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Escolha o workflow de destino" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Nenhum outro workflow ativo nesta conta ainda.
            </p>
          )}
          {options.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Encerra este workflow aqui e continua a pessoa no início do workflow
        escolhido. Se ela já tiver passado por lá antes, nada é reenviado
        (cada pessoa entra uma vez em cada workflow).
      </p>
    </div>
  );
}
