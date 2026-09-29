import type { createClient } from "@/lib/supabase/server";

import type { MessageKind } from "../../shared/types/message";
import type { PipelineStageOption } from "../components/workflow/pipeline-stage-context";
import { toNumber } from "../utils/fractional-index";
import type {
  Board,
  BoardColumn,
  BoardLeadCard,
  Lead,
  LeadDetail,
  LeadStageEvent,
  Pipeline,
  PipelineOption,
  PipelineStage,
} from "../types";

/**
 * Leituras do Funil, sempre com o client do usuário (RLS garante que ele só
 * vê os próprios funis/leads). Só servidor: Server Components e Server Actions.
 */

type UserClient = ReturnType<typeof createClient>;

const CARDS_PER_COLUMN = 50;

/** Linha crua de `pipeline_stages` com o embed de `pipelines(name, account_id)`. */
type StageWithPipelineRow = {
  id: string;
  name: string;
  pipelines: { name: string; account_id: string } | null;
};

/** Mapeia o embed `pipeline_stages -> pipelines` do editor de Workflow para as opções do nó/condição. */
export function stageOptionsFromRows(rows: unknown): PipelineStageOption[] {
  return ((rows ?? []) as StageWithPipelineRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    pipelineName: s.pipelines?.name ?? "Funil",
    accountId: s.pipelines?.account_id ?? "",
  }));
}

export async function listPipelines(supabase: UserClient, accountId: string): Promise<PipelineOption[]> {
  const { data } = await supabase
    .from("pipelines")
    .select("id, name, account_id")
    .eq("account_id", accountId)
    .order("is_default", { ascending: false })
    .order("name");
  return (data ?? []) as PipelineOption[];
}

type ConversationJoin = {
  id: string;
  ig_sender_id: string;
  ig_sender_username: string | null;
  last_message_text: string | null;
  last_message_kind: MessageKind | null;
  unread_count: number | null;
};

type LeadRow = {
  id: string;
  stage_id: string;
  value: number | null;
  position: number;
  entered_stage_at: string;
  conversation_id: string;
  ig_sender_id: string;
  closed_at: string | null;
  conversations: ConversationJoin | null;
};

function toCard(row: LeadRow): BoardLeadCard {
  return {
    id: row.id,
    stage_id: row.stage_id,
    value: row.value == null ? null : toNumber(row.value),
    position: toNumber(row.position),
    entered_stage_at: row.entered_stage_at,
    conversation_id: row.conversation_id,
    ig_sender_id: row.ig_sender_id,
    ig_sender_username: row.conversations?.ig_sender_username ?? null,
    last_message_text: row.conversations?.last_message_text ?? null,
    last_message_kind: row.conversations?.last_message_kind ?? null,
    unread_count: row.conversations?.unread_count ?? 0,
  };
}

const LEAD_COLUMNS =
  "id, stage_id, value, position, entered_stage_at, conversation_id, ig_sender_id, closed_at, conversations(id, ig_sender_id, ig_sender_username, last_message_text, last_message_kind, unread_count)";

/**
 * Board completo de um funil: etapas ordenadas, até 50 cards por coluna
 * (pela posição) e contagem/soma de valor de TODOS os leads da coluna (não
 * só os carregados). Sem filtro de `closed_at`: as colunas Ganho/Perdido são
 * justamente os leads fechados.
 */
export async function getBoard(supabase: UserClient, pipelineId: string): Promise<Board | null> {
  const { data: pipeline } = await supabase.from("pipelines").select("*").eq("id", pipelineId).maybeSingle<Pipeline>();
  if (!pipeline) return null;

  const { data: stageRows } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("position");
  const stages = ((stageRows ?? []) as PipelineStage[]).map((s) => ({ ...s, position: toNumber(s.position) }));

  // Estatística (contagem/soma) sobre TODOS os leads da coluna, sem cap de 50.
  const { data: statRows } = await supabase.from("leads").select("stage_id, value").eq("pipeline_id", pipelineId);
  const stats = new Map<string, { count: number; sum: number }>();
  for (const row of (statRows ?? []) as { stage_id: string; value: number | null }[]) {
    const current = stats.get(row.stage_id) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += toNumber(row.value);
    stats.set(row.stage_id, current);
  }

  const columns: BoardColumn[] = await Promise.all(
    stages.map(async (stage) => {
      const { data: leadRows } = await supabase
        .from("leads")
        .select(LEAD_COLUMNS)
        .eq("pipeline_id", pipelineId)
        .eq("stage_id", stage.id)
        .order("position", { ascending: true })
        .limit(CARDS_PER_COLUMN + 1);
      const rows = (leadRows ?? []) as unknown as LeadRow[];
      const cards = rows.slice(0, CARDS_PER_COLUMN).map(toCard);
      const stat = stats.get(stage.id) ?? { count: 0, sum: 0 };
      return { ...stage, cards, count: stat.count, valueSum: stat.sum, hasMore: rows.length > CARDS_PER_COLUMN };
    })
  );

  return { pipeline, columns };
}

/**
 * "Carregar mais" de uma coluna: próxima página depois da última posição já
 * carregada. Cursor por posição, não offset: arrastar cards para dentro ou
 * para fora da coluna não desloca a página (offset duplicava ou pulava card).
 */
export async function loadMoreStageLeads(
  supabase: UserClient,
  pipelineId: string,
  stageId: string,
  afterPosition: number
): Promise<{ cards: BoardLeadCard[]; hasMore: boolean }> {
  const { data } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("pipeline_id", pipelineId)
    .eq("stage_id", stageId)
    .gt("position", afterPosition)
    .order("position", { ascending: true })
    .limit(CARDS_PER_COLUMN + 1);
  const rows = (data ?? []) as unknown as LeadRow[];
  return { cards: rows.slice(0, CARDS_PER_COLUMN).map(toCard), hasMore: rows.length > CARDS_PER_COLUMN };
}

type LeadDetailRow = Lead & {
  conversations: { ig_sender_id: string; ig_sender_username: string | null } | null;
};

export async function getLeadDetail(supabase: UserClient, leadId: string): Promise<LeadDetail | null> {
  const { data: row } = await supabase
    .from("leads")
    .select("*, conversations(ig_sender_id, ig_sender_username)")
    .eq("id", leadId)
    .maybeSingle<LeadDetailRow>();
  if (!row) return null;
  const { conversations, ...lead } = row;

  const { data: stages } = await supabase.from("pipeline_stages").select("id, name").eq("pipeline_id", lead.pipeline_id);
  const stageNameById = new Map(((stages ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const { data: eventRows } = await supabase
    .from("lead_stage_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("moved_at", { ascending: false });

  const events = ((eventRows ?? []) as LeadStageEvent[]).map((e) => ({
    ...e,
    fromStageName: e.from_stage_id ? stageNameById.get(e.from_stage_id) ?? "Etapa removida" : null,
    toStageName: e.to_stage_id ? stageNameById.get(e.to_stage_id) ?? "Etapa removida" : null,
  }));

  return {
    lead,
    stageName: stageNameById.get(lead.stage_id) ?? "Etapa removida",
    events,
    ig_sender_id: conversations?.ig_sender_id ?? lead.ig_sender_id,
    ig_sender_username: conversations?.ig_sender_username ?? null,
  };
}
