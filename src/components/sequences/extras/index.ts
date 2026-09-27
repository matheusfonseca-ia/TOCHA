/**
 * Extras estilo ManyChat: campos do gatilho "Link de referência", e os nós
 * "Aleatório", "Ir para workflow" e "Pausar automações". "Aleatório" edita
 * direto em sequence-nodes.tsx (as saídas por caminho ficam junto do campo
 * que virou o nome do caminho, não dá pra reaproveitar um formulário à
 * parte); os outros dois seguem o padrão de card com formulário próprio.
 */
export { RefLinkFields } from "./ref-link-fields";
export {
  GoToSequenceProvider,
  useGoToSequenceOptions,
  type GoToSequenceOption,
} from "./go-to-sequence-context";
export { GoToSequenceNodeContent } from "./go-to-sequence-node";
export { GoToSequenceForm } from "./go-to-sequence-form";
export { StopAutomationForm } from "./stop-automation-form";
