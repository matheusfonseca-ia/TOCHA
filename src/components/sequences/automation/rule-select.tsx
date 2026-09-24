"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Rule } from "@/types/database";

import { ruleDisplayName } from "./automation-rules-context";

/**
 * Select de automações (rules) da conta, agrupado DM / Comentário. Usado
 * pelo nó "Automação" (`automation-node-form.tsx`) e pelo gatilho, quando a
 * automação é escolhida direto nele ("Automação existente") — um só lugar
 * pra não duplicar a lista.
 */
export interface RuleSelectProps {
  rules: Rule[];
  value: string;
  onChange: (ruleId: string) => void;
  /** Desabilita as rules de comentário (posição não permite). */
  disableComment?: boolean;
  placeholder?: string;
}

export function RuleSelect({
  rules,
  value,
  onChange,
  disableComment = false,
  placeholder = "Escolha uma automação",
}: RuleSelectProps) {
  const dmRules = rules.filter((r) => r.trigger_type !== "comment");
  const commentRules = rules.filter((r) => r.trigger_type === "comment");

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {rules.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhuma automação nesta conta ainda.
          </p>
        )}
        {dmRules.length > 0 && (
          <SelectGroup>
            <SelectLabel>DM</SelectLabel>
            {dmRules.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {ruleDisplayName(r)}
                {!r.is_active && " (pausada)"}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {commentRules.length > 0 && (
          <SelectGroup>
            <SelectLabel>Comentário</SelectLabel>
            {commentRules.map((r) => (
              <SelectItem key={r.id} value={r.id} disabled={disableComment}>
                {ruleDisplayName(r)}
                {!r.is_active && " (pausada)"}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
