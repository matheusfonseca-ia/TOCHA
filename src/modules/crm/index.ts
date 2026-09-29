/**
 * API pública do módulo CRM para a UI (rotas em src/app). Código de servidor
 * (consultas, captura do webhook) sai por `@/modules/crm/server`.
 */
export { InboxShell } from "./inbox/components/inbox-shell";
export type {
  InboxAccount,
  InboxConversation,
  InboxFilters,
  InboxThread,
} from "./shared/types/conversation";
export { PipelineBoard } from "./pipeline/components/pipeline-board";
export type { Board, PipelineOption } from "./pipeline/types";
