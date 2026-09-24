/**
 * Nó "Automação" do editor de workflow: card do canvas, formulário do
 * inspector e o provider que entrega as rules da conta aos nós.
 */
export { AutomationNodeBody, TriggerAutomationSummary } from "./automation-node";
export {
  AutomationNodeForm,
  type AutomationPreviewAccount,
} from "./automation-node-form";
export {
  AutomationRulesProvider,
  ruleDisplayName,
  ruleTypeLabel,
  useAutomationRules,
} from "./automation-rules-context";
export { RuleSelect, type RuleSelectProps } from "./rule-select";
