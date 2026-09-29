import type { MessageKind } from "../shared/types/message";

/** Tipos do Funil (Fase 5), migration 0013_crm_pipeline.sql. */

export type StageType = "open" | "won" | "lost";
export type LeadMoveSource = "manual" | "automation" | "system";

export interface Pipeline {
  id: string;
  account_id: string;
  name: string;
  is_default: boolean;
  auto_enroll: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  stage_type: StageType;
  on_enter_sequence_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  pipeline_id: string;
  account_id: string;
  conversation_id: string;
  ig_sender_id: string;
  stage_id: string;
  value: number | null;
  position: number;
  entered_stage_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadStageEvent {
  id: string;
  lead_id: string;
  account_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  source: LeadMoveSource;
  moved_by: string | null;
  moved_at: string;
}

/** Card do board: lead + o que a coluna precisa mostrar (sem N+1 por card). */
export interface BoardLeadCard {
  id: string;
  stage_id: string;
  value: number | null;
  position: number;
  entered_stage_at: string;
  conversation_id: string;
  ig_sender_id: string;
  ig_sender_username: string | null;
  last_message_text: string | null;
  last_message_kind: MessageKind | null;
  unread_count: number;
}

export interface BoardColumn extends PipelineStage {
  cards: BoardLeadCard[];
  count: number;
  valueSum: number;
  hasMore: boolean;
}

export interface Board {
  pipeline: Pipeline;
  columns: BoardColumn[];
}

/** Opção do seletor de funil no cabeçalho do board. */
export interface PipelineOption {
  id: string;
  name: string;
  account_id: string;
}

/** Ficha do lead no drawer: card + histórico + dados básicos da conversa. */
export interface LeadDetail {
  lead: Lead;
  stageName: string;
  events: (LeadStageEvent & { fromStageName: string | null; toStageName: string | null })[];
  ig_sender_id: string;
  ig_sender_username: string | null;
}
