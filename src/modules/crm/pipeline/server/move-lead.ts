import type { createAdminClient } from "@/lib/supabase/admin";

import { positionBetween, toNumber } from "../utils/fractional-index";
import type { Lead, LeadMoveSource, PipelineStage } from "../types";

/**
 * Move (ou cria) um lead numa etapa. Usada tanto pelo board (arrastar,
 * `source: "manual"`) quanto pelo runtime do workflow (nó "Mover para
 * etapa" e a entrada automática da captura, `source: "automation"` /
 * `"system"`), um único caminho grava o lead e o histórico, então as duas
 * pontas nunca divergem.
 *
 * Identifica o lead por `leadId` (o board já sabe qual é) ou por
 * `conversationId` (o runtime só tem a conversa; cria o lead se ainda não
 * existir aberto neste funil). Sempre com a service role: quem chama já
 * conferiu a posse.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const PG_UNIQUE_VIOLATION = "23505";

export interface MoveLeadInput {
  accountId: string;
  toStageId: string;
  source: LeadMoveSource;
  movedBy?: string | null;
  lostReason?: string | null;
  /** Nova posição na coluna de destino. Ausente = vai para o fim dela. */
  position?: number;
  leadId?: string;
  conversationId?: string;
  igSenderId?: string;
}

export interface MoveLeadResult {
  lead: Lead;
  /** false = já estava nesta etapa (reordenar não conta): nada mais a fazer. */
  changed: boolean;
  targetStage: PipelineStage;
}

async function loadStage(admin: AdminClient, accountId: string, stageId: string): Promise<PipelineStage> {
  const { data: stage } = await admin.from("pipeline_stages").select("*").eq("id", stageId).maybeSingle<PipelineStage>();
  if (!stage) throw new Error("Etapa não encontrada.");
  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id")
    .eq("id", stage.pipeline_id)
    .eq("account_id", accountId)
    .maybeSingle<{ id: string }>();
  if (!pipeline) throw new Error("Etapa não pertence a esta conta.");
  return stage;
}

async function endOfColumnPosition(admin: AdminClient, pipelineId: string, stageId: string): Promise<number> {
  const { data } = await admin
    .from("leads")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .eq("stage_id", stageId)
    .is("closed_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  return positionBetween(data ? toNumber(data.position) : null, null);
}

function closingFields(stage: PipelineStage, lostReason: string | null | undefined) {
  if (stage.stage_type === "won") return { closed_at: new Date().toISOString(), lost_reason: null };
  if (stage.stage_type === "lost") return { closed_at: new Date().toISOString(), lost_reason: lostReason ?? null };
  return { closed_at: null, lost_reason: null };
}

async function createLead(admin: AdminClient, input: MoveLeadInput, stage: PipelineStage): Promise<MoveLeadResult> {
  if (!input.conversationId || !input.igSenderId) {
    throw new Error("Lead novo precisa de conversationId e igSenderId.");
  }
  const position = input.position ?? (await endOfColumnPosition(admin, stage.pipeline_id, stage.id));
  const now = new Date().toISOString();
  const { data: created, error } = await admin
    .from("leads")
    .insert({
      pipeline_id: stage.pipeline_id,
      account_id: input.accountId,
      conversation_id: input.conversationId,
      ig_sender_id: input.igSenderId,
      stage_id: stage.id,
      value: null,
      position,
      entered_stage_at: now,
      ...closingFields(stage, input.lostReason),
    })
    .select("*")
    .maybeSingle<Lead>();

  if (!created) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      // Corrida: outra chamada já criou o lead aberto para esta conversa
      // neste funil. Não é uma mudança nossa, devolve o que já existe.
      const race = await admin
        .from("leads")
        .select("*")
        .eq("pipeline_id", stage.pipeline_id)
        .eq("conversation_id", input.conversationId)
        .is("closed_at", null)
        .maybeSingle<Lead>();
      if (race.data) return { lead: race.data, changed: false, targetStage: stage };
    }
    throw new Error(`lead não criado: ${error?.message ?? "sem linha"}`);
  }

  await admin.from("lead_stage_events").insert({
    lead_id: created.id,
    account_id: input.accountId,
    from_stage_id: null,
    to_stage_id: stage.id,
    source: input.source,
    moved_by: input.movedBy ?? null,
  });

  return { lead: created, changed: true, targetStage: stage };
}

export async function moveLead(admin: AdminClient, input: MoveLeadInput): Promise<MoveLeadResult> {
  const stage = await loadStage(admin, input.accountId, input.toStageId);

  let lead: Lead | null = null;
  if (input.leadId) {
    const { data } = await admin.from("leads").select("*").eq("id", input.leadId).eq("account_id", input.accountId).maybeSingle<Lead>();
    lead = data;
    if (!lead) throw new Error("Lead não encontrado.");
  } else if (input.conversationId) {
    const { data } = await admin
      .from("leads")
      .select("*")
      .eq("pipeline_id", stage.pipeline_id)
      .eq("conversation_id", input.conversationId)
      .is("closed_at", null)
      .maybeSingle<Lead>();
    lead = data;
  } else {
    throw new Error("moveLead precisa de leadId ou conversationId.");
  }

  if (!lead) return createLead(admin, input, stage);

  // Já está nesta etapa: reordenar dentro da coluna é permitido, mas não
  // conta como "mudou de etapa": trava anti-loop do nó "Mover para etapa"
  // e evita histórico/gatilho de entrada repetidos.
  if (lead.stage_id === stage.id) {
    if (input.position != null && input.position !== lead.position) {
      const { data: updated } = await admin
        .from("leads")
        .update({ position: input.position, updated_at: new Date().toISOString() })
        .eq("id", lead.id)
        .select("*")
        .maybeSingle<Lead>();
      return { lead: updated ?? lead, changed: false, targetStage: stage };
    }
    return { lead, changed: false, targetStage: stage };
  }

  const position = input.position ?? (await endOfColumnPosition(admin, stage.pipeline_id, stage.id));
  const { data: updated, error } = await admin
    .from("leads")
    .update({
      stage_id: stage.id,
      position,
      entered_stage_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...closingFields(stage, input.lostReason),
    })
    .eq("id", lead.id)
    .select("*")
    .maybeSingle<Lead>();
  if (!updated) throw new Error(`lead não movido: ${error?.message ?? "sem linha"}`);

  await admin.from("lead_stage_events").insert({
    lead_id: lead.id,
    account_id: input.accountId,
    from_stage_id: lead.stage_id,
    to_stage_id: stage.id,
    source: input.source,
    moved_by: input.movedBy ?? null,
  });

  return { lead: updated, changed: true, targetStage: stage };
}
