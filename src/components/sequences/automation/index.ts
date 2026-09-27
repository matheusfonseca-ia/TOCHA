/**
 * Nó "Automação" do editor de workflow: card do canvas (resumo + edição
 * inline quando selecionado) e o provider que entrega as rules da conta aos
 * nós.
 */
export { AutomationNodeContent, TriggerAutomationSummary } from "./automation-node";
export { AutomationNodeForm } from "./automation-node-form";
export {
  AutomationRulesProvider,
  ruleDisplayName,
  ruleTypeLabel,
  useAutomationRules,
  type AutomationPreviewAccount,
} from "./automation-rules-context";
export { RuleSelect, type RuleSelectProps } from "./rule-select";
