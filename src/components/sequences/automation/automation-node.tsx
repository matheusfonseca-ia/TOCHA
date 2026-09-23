"use client";

import { MessageCircle, Send, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import {
  ruleDisplayName,
  ruleTypeLabel,
  useAutomationRules,
} from "./automation-rules-context";

/**
 * Conteúdo do card do nó "Automação" no canvas. A moldura (handles, título,
 * destaque de erro) é o NodeFrame de sequence-nodes.tsx, igual aos outros
 * blocos. Mostra a rule referenciada: nome, tipo (DM/Comentário) e se está
 * ativa; rule excluída vira o estado "Automação removida".
 */
export function AutomationNodeBody({ ruleId }: { ruleId: string }) {
  const { rulesById } = useAutomationRules();
  const rule = ruleId ? rulesById.get(ruleId) : undefined;

  if (!ruleId) {
    return (
      <p className="text-xs italic text-muted-foreground/70">
        Escolha uma automação…
      </p>
    );
  }
  if (!rule) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <span className="font-medium">Automação removida.</span> Escolha
          outra ou exclua este bloco.
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="line-clamp-2 break-words text-xs font-medium text-foreground">
        {ruleDisplayName(rule)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="muted" className="gap-1">
          {rule.trigger_type === "comment" ? (
            <MessageCircle className="h-3 w-3" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          {ruleTypeLabel(rule)}
        </Badge>
        <Badge variant={rule.is_active ? "success" : "warning"}>
          {rule.is_active ? "Ativa" : "Pausada"}
        </Badge>
      </div>
      {rule.trigger_type === "comment" && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Continua depois que o link é entregue
        </p>
      )}
    </div>
  );
}

/**
 * Conteúdo do card do Gatilho quando o fluxo começa por uma automação
 * ("Quando a automação X disparar"). Lê a rule de entrada do provider.
 */
export function TriggerAutomationSummary() {
  const { rulesById, entryRuleId } = useAutomationRules();
  const rule = entryRuleId ? rulesById.get(entryRuleId) : undefined;

  if (!entryRuleId) {
    return (
      <p className="text-xs italic text-muted-foreground/70">
        Ligue a um bloco Automação…
      </p>
    );
  }
  if (!rule) {
    return (
      <p className="text-xs text-destructive">
        Automação removida: o fluxo não inicia.
      </p>
    );
  }
  return (
    <p className="break-words text-xs text-muted-foreground">
      Quando a automação{" "}
      <span className="font-medium text-foreground">{ruleDisplayName(rule)}</span>{" "}
      disparar
      {!rule.is_active && (
        <span className="text-amber-700 dark:text-amber-300"> (pausada)</span>
      )}
    </p>
  );
}
