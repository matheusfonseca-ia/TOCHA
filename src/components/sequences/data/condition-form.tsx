"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TAG_MAX } from "@/lib/sequences/fields";
import type { ConditionNodeData, ConditionOperator } from "@/types/sequence";

import { FieldKeyInput } from "./data-fields-context";
import { OPERATOR_OPTIONS } from "./labels";

export function ConditionForm({
  data,
  onChange,
}: {
  data: ConditionNodeData;
  onChange: (data: ConditionNodeData) => void;
}) {
  const isTag = data.operator === "hasTag";

  return (
    <div className="space-y-4">
      {!isTag && (
        <div className="space-y-2">
          <Label htmlFor="condition-field">Campo</Label>
          <FieldKeyInput
            id="condition-field"
            value={data.fieldKey}
            onChange={(fieldKey) => onChange({ ...data, fieldKey })}
            placeholder="ex.: plano"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Regra</Label>
        <Select
          value={data.operator}
          onValueChange={(v) => onChange({ ...data, operator: v as ConditionOperator })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATOR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.value === "hasTag" ? "Contato tem a tag" : `Campo ${o.label}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.operator !== "exists" && (
        <div className="space-y-2">
          <Label htmlFor="condition-value">{isTag ? "Tag" : "Valor"}</Label>
          <Input
            id="condition-value"
            placeholder={isTag ? "ex.: vip" : data.operator === "gt" || data.operator === "lt" ? "ex.: 18 ou 01/01/2000" : "ex.: pro"}
            maxLength={isTag ? TAG_MAX : 500}
            value={data.value}
            onChange={(e) => onChange({ ...data, value: e.target.value })}
          />
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Compara sem diferenciar maiúsculas e acentos. “Maior” e “menor”
        funcionam com números e datas (dd/mm/aaaa). Verdadeiro segue por
        “sim”, falso por “não”; saída sem ligação encerra o fluxo.
      </p>
    </div>
  );
}
