export type AccountStatus = "active" | "expired" | "disconnected";
export type MatchType = "exact" | "contains" | "starts_with";
export type ReplyType = "text" | "image" | "buttons";
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

export interface IgAccount {
  id: string;
  user_id: string;
  ig_user_id: string;
  ig_username: string;
  page_id: string;
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
  keyword: string;
  match_type: MatchType;
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

export interface UserSettings {
  user_id: string;
  n8n_webhook_url: string | null;
  n8n_enabled: boolean;
  updated_at: string;
}
