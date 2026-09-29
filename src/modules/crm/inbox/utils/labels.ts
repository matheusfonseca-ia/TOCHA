import type { SequenceRunStatus } from "@/types/sequence";

import type { MessageKind, MessageSource } from "../../shared/types/message";

/** Quem enviou uma mensagem que saiu da conta. */
export const SOURCE_LABEL: Record<MessageSource, string> = {
  contact: "Lead",
  automation: "Automação",
  workflow: "Workflow",
  agent: "Você",
  instagram_app: "App do Instagram",
  import: "Histórico",
};

const KIND_LABEL: Record<MessageKind, string> = {
  text: "Mensagem",
  image: "Foto",
  video: "Vídeo",
  audio: "Áudio",
  file: "Arquivo",
  sticker: "Figurinha",
  share: "Publicação compartilhada",
  reel: "Reel compartilhado",
  story_reply: "Respondeu seu story",
  story_mention: "Mencionou você no story",
  postback: "Tocou em um botão",
  buttons: "Mensagem com botões",
  quick_replies: "Mensagem com opções",
  attachment: "Anexo",
  unsupported: "Mensagem não suportada",
};

/** Texto curto da última mensagem (lista de conversas). */
export function messagePreview(kind: MessageKind | null, text: string | null): string {
  const clean = text?.trim();
  if (!kind) return clean || "Mensagem";
  if (kind === "postback") return clean ? `Tocou em "${clean}"` : KIND_LABEL.postback;
  if (clean) return clean;
  return KIND_LABEL[kind] ?? "Mensagem";
}

export function kindLabel(kind: MessageKind): string {
  return KIND_LABEL[kind] ?? "Mensagem";
}

export const RUN_STATUS_LABEL: Record<SequenceRunStatus, string> = {
  running: "Rodando",
  waiting_reply: "Esperando resposta",
  waiting_postback: "Esperando toque em botão",
  waiting_delay: "Em atraso agendado",
  completed: "Concluído",
  window_expired: "Janela fechada",
  error: "Erro",
};

/** Nome exibido do lead: @ quando conhecido, senão o fim do ID do Instagram. */
export function leadName(username: string | null, igSenderId: string): string {
  return username ? `@${username}` : `Lead ${igSenderId.slice(-4)}`;
}

/** Iniciais para o avatar (sem foto: a URL de perfil da Meta expira). */
export function leadInitials(username: string | null): string {
  const base = (username ?? "").replace(/[^a-zA-Z0-9]/g, "");
  return base ? base.slice(0, 2).toUpperCase() : "IG";
}
