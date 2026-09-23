"use client";

import { createContext, useContext, useMemo } from "react";

import type { Rule } from "@/types/database";

/**
 * As automações (rules) da conta, disponíveis para os nós do canvas. O React
 * Flow só passa `data` para cada nó, e o nó Automação guarda só o `ruleId`
 * (referência, não cópia): o card resolve nome, tipo e status por aqui.
 */

interface AutomationRulesValue {
  rulesById: Map<string, Rule>;
  /** Rule de entrada do fluxo (gatilho em source "automation"), para o card do gatilho. */
  entryRuleId: string | null;
}

const AutomationRulesContext = createContext<AutomationRulesValue>({
  rulesById: new Map(),
  entryRuleId: null,
});

export function AutomationRulesProvider({
  rules,
  entryRuleId = null,
  children,
}: {
  rules: Rule[];
  entryRuleId?: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      rulesById: new Map(rules.map((r) => [r.id, r])),
      entryRuleId,
    }),
    [rules, entryRuleId]
  );
  return (
    <AutomationRulesContext.Provider value={value}>
      {children}
    </AutomationRulesContext.Provider>
  );
}

export function useAutomationRules(): AutomationRulesValue {
  return useContext(AutomationRulesContext);
}

/** Nome exibido da automação: o nome dado pelo usuário, senão as palavras-chave. */
export function ruleDisplayName(rule: Rule): string {
  const name = rule.name?.trim();
  if (name) return name;
  if (rule.trigger_type === "comment" && rule.comment_any_word) {
    return "Qualquer comentário";
  }
  return rule.keyword?.trim() || "Automação sem nome";
}

export function ruleTypeLabel(rule: Pick<Rule, "trigger_type">): string {
  return rule.trigger_type === "comment" ? "Comentário" : "DM";
}
