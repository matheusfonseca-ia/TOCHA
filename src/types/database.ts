export type AccountStatus = "active" | "expired" | "disconnected";
export type MatchType = "exact" | "contains" | "starts_with";
export type ReplyType = "text" | "image" | "buttons";
export type TriggerType = "dm" | "comment";
export type MediaMode = "specific" | "any";
export type InteractionStatus =
  | "replied"
  | "no_match"
  | "duplicate_skip"
  | "window_expired"
  | "error";

export interface ReplyButton {
  title: string;
  url: string;
}

/** Snapshot de uma publicação/Reel escolhido como gatilho (evita nova chamada à Graph API só para exibir a lista). */
export interface MediaRef {
  id: string;
  media_type: string;
  thumbnail_url: string | null;
  permalink: string | null;
  caption: string | null;
}

export interface IgAccount {
  id: string;
  user_id: string;
  ig_user_id: string;
  ig_username: string;
  /** Legado do fluxo via Facebook; nulo em contas conectadas com Login do Instagram. */
  page_id: string | null;
  page_name: string | null;
  profile_picture_url: string | null;
  access_token_enc: string;
  token_expires_at: string | null;
  status: AccountStatus;
  connected_at: string;
}

export interface Rule {
  id: string;
  account_id: string;
  name: string | null;
  trigger_type: TriggerType;
  keyword: string | null;
  match_type: MatchType;
  /** Só relevante para trigger_type "comment". */
  media_mode: MediaMode | null;
  media_refs: MediaRef[] | null;
  comment_any_word: boolean;
  public_reply_enabled: boolean;
  public_reply_text: string | null;
  /** 1ª mensagem do fluxo de comentário (resposta privada + botão postback). */
  welcome_text: string | null;
  welcome_button_label: string | null;
  /** 2ª mensagem: em regras "dm" é a resposta direta; em "comment" é o que chega ao tocar no botão. */
  reply_type: ReplyType;
  reply_text: string | null;
  reply_image_url: string | null;
  reply_buttons: ReplyButton[] | null;
  delay_seconds: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  account_id: string;
  ig_sender_id: string;
  ig_sender_username: string | null;
  last_inbound_at: string;
  created_at: string;
}

export interface Interaction {
  id: string;
  account_id: string;
  ig_sender_id: string;
  message_text: string | null;
  matched_rule_id: string | null;
  matched_keyword: string | null;
  status: InteractionStatus;
  reply_type: ReplyType | null;
  error_detail: string | null;
  latency_ms: number | null;
  created_at: string;
}
