/**
 * API pública do módulo CRM para código de servidor (webhook, runtime de
 * workflows, Server Components). Componentes de cliente nunca importam daqui.
 */
export { captureMessagingEvent } from "./capture/server/capture-event";
export { observeOutbound, type OutboundContext } from "./capture/server/observe-outbound";
export { isTakenOver } from "./handoff/server/takeover";
export { getThread, getUnreadTotal, listConversations } from "./inbox/services/inbox.queries";
export type {
  MessageDraft,
  MessageKind,
  MessageRow,
  MessageSource,
} from "./shared/types/message";
export { listAllTagNames, listTagCatalog, listTagOptionsForEditor } from "./tags/services/tags.queries";
export type { CrmTag, TagColor } from "./tags/types";
