/**
 * Ponte do Funil com o editor de Workflow (Fase 6): nó "Mover para etapa" e
 * o provider que resolve id de etapa -> nome (usado também pela condição
 * "Está na etapa", em `components/sequences/data`).
 */
export {
  PipelineStageProvider,
  usePipelineStageOptions,
  type PipelineStageOption,
} from "./pipeline-stage-context";
export { MoveToStageNodeContent } from "./move-to-stage-node";
export { MoveToStageForm } from "./move-to-stage-form";
