"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STOP_AUTOMATION_MAX_HOURS,
  STOP_AUTOMATION_MIN_HOURS,
} from "@/lib/sequences/graph";
import type { StopAutomationNodeData } from "@/types/sequence";

const PRESETS = [
  { label: "24h", hours: 24 },
  { label: "3 dias", hours: 72 },
  { label: "1h", hours: 1 },
];

/** Formulário do inspector para o nó "Pausar automações". */
export function StopAutomationForm({
  data,
  patch,
}: {
  data: StopAutomationNodeData;
  patch: (d: StopAutomationNodeData) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="seq-stop-hours">Por quantas horas</Label>
        <Input
          id="seq-stop-hours"
          type="number"
          min={STOP_AUTOMATION_MIN_HOURS}
          max={STOP_AUTOMATION_MAX_HOURS}
          value={Number.isFinite(data.hours) ? data.hours : ""}
          onChange={(e) => patch({ ...data, hours: Number(e.target.value) })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.hours}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ ...data, hours: p.hours })}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        De {STOP_AUTOMATION_MIN_HOURS} a {STOP_AUTOMATION_MAX_HOURS} horas.
        Enquanto durar, a pessoa não entra em nenhuma regra nem workflow novo
        (se ela já estiver no meio de um fluxo, ele continua normalmente).
      </p>
    </div>
  );
}
