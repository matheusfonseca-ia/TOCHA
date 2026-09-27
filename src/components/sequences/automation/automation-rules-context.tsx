"use client";

import { createContext, useContext, useMemo } from "react";

import type { Rule } from "@/types/database";
import type { TriggerSource } from "@/types/sequence";

/**
 * As automações (rules) da conta, disponíveis para os nós do canvas. O React
 * Flow só passa `data` para cada nó, e o nó Automação guarda só o `ruleId`
 * (referência, não cópia): o card resolve nome, tipo e status por aqui — e,
 * quando selecionado, também edita (escolher outra automação, ligar/desligar
 * "iniciar o fluxo por aqui") direto no card, sem precisar de props vindas de
 * fora do React Flow.
 */

export interface AutomationPreviewAccount {
  ig_username: string;
  profile_picture_url?: string | null;
}

interface AutomationRulesValue {
  /** Array cru (o resumo usa só `rulesById`; o formulário precisa iterar). */
  rules: Rule[];
  rulesById: Map<string, Rule>;
  /** Rule de entrada do fluxo (gatilho em source "automation"), para o card do gatilho. */
  entryRuleId: string | null;
  /** Id do bloco ligado direto à saída do gatilho (posição no grafo, não a rule). */
  entryNodeId: string | null;
  /** Conta da sequência, para o preview do bloco Automação. */
  account: AutomationPreviewAccount | null;
  /** source atual do gatilho (ausente no grafo = "dm"). */
  triggerSource: TriggerSource;
  /** Troca o source do gatilho (chamado pelo próprio gatilho ou por um bloco Automação em posição de entrada). */
  onTriggerSourceChange: (source: TriggerSource) => void;
}

function noopTriggerSourceChange() {}

const AutomationRulesContext = createContext<AutomationRulesValue>({
  rules: [],
  rulesById: new Map(),
  entryRuleId: null,
  entryNodeId: null,
  account: null,
  triggerSource: "unset",
  onTriggerSourceChange: noopTriggerSourceChange,
});

export function AutomationRulesProvider({
  rules,
  entryRuleId = null,
  entryNodeId = null,
  account = null,
  triggerSource = "unset",
  onTriggerSourceChange = noopTriggerSourceChange,
  children,
}: {
  rules: Rule[];
  entryRuleId?: string | null;
  entryNodeId?: string | null;
  account?: AutomationPreviewAccount | null;
  triggerSource?: TriggerSource;
  onTriggerSourceChange?: (source: TriggerSource) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      rules,
      rulesById: new Map(rules.map((r) => [r.id, r])),
      entryRuleId,
      entryNodeId,
      account,
      triggerSource,
      onTriggerSourceChange,
    }),
    [rules, entryRuleId, entryNodeId, account, triggerSource, onTriggerSourceChange]
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
