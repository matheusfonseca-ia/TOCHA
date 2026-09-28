/**
 * API pública do módulo CRM para código de servidor (webhook, runtime de
 * workflows, server actions). Componentes de cliente nunca importam daqui.
 */
export { captureMessagingEvent } from "./capture/server/capture-event";
export { observeOutbound, type OutboundContext } from "./capture/server/observe-outbound";
export type {
  MessageDraft,
  MessageKind,
  MessageRow,
  MessageSource,
} from "./shared/types/message";
