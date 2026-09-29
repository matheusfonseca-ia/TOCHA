"use server";

import { revalidatePath } from "next/cache";

import { startSequenceFromGoTo } from "@/lib/sequences/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { enrollExistingConversations } from "../server/enroll-lead";
import { moveLead } from "../server/move-lead";
import { getLeadDetail, loadMoreStageLeads } from "./pipeline.queries";
import { positionBetween, reindexPositions, toNumber } from "../utils/fractional-index";
import type { BoardLeadCard, LeadDetail, StageType } from "../types";

/**
 * Server actions do Funil. Sempre confere posse com o client do usuário
 * (RLS) antes de escrever com a service role, mesmo padrão de
 * `inbox.actions.ts`. `revalidatePath` mantém o board (Server Component) e a
 * ficha do Inbox sincronizados depois de qualquer mudança.
 */

const FUNIL_PATH = "/crm/funil";
const CONVERSAS_PATH = "/crm/conversas";

type ActionResult = { error?: string };

/** Depois de mover para uma etapa com "ao entrar, iniciar workflow": dispara best effort. */
async function maybeStartStageWorkflow(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  senderId: string,
  sequenceId: string | null
): Promise<void> {
  if (!sequenceId) return;
  try {
    const { data: account } = await admin.from("ig_accounts").select("*").eq("id", accountId).maybeSingle<IgAccount>();
    if (account) await startSequenceFromGoTo(admin, account, senderId, sequenceId);
  } catch (err) {
    console.error("[crm] workflow de entrada da etapa falhou:", err instanceof Error ? err.message : err);
  }
}

export async function moveLeadAction(input: {
  leadId: string;
  toStageId: string;
  position?: number;
  lostReason?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const [{ data: lead }, { data: userRes }] = await Promise.all([
    supabase.from("leads").select("id, account_id").eq("id", input.leadId).maybeSingle<{ id: string; account_id: string }>(),
    supabase.auth.getUser(),
  ]);
  if (!lead) return { error: "Lead não encontrado." };

  const admin = createAdminClient();
  try {
    const result = await moveLead(admin, {
      accountId: lead.account_id,
      toStageId: input.toStageId,
      source: "manual",
      movedBy: userRes.user?.id ?? null,
      position: input.position,
      lostReason: input.lostReason,
      leadId: lead.id,
    });
    if (result.changed) {
      await maybeStartStageWorkflow(admin, lead.account_id, result.lead.ig_sender_id, result.targetStage.on_enter_sequence_id);
    }
    revalidatePath(FUNIL_PATH);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível mover o lead." };
  }
}

/** Ficha do lead pro drawer do board: carregada sob demanda, ao abrir o card. */
export async function getLeadDetailAction(leadId: string): Promise<LeadDetail | null> {
  return getLeadDetail(createClient(), leadId);
}

/** "Carregar mais" de uma coluna do board. */
export async function loadMoreLeadsAction(
  pipelineId: string,
  stageId: string,
  offset: number
): Promise<{ cards: BoardLeadCard[]; hasMore: boolean }> {
  return loadMoreStageLeads(createClient(), pipelineId, stageId, offset);
}

export async function updateLeadValueAction(leadId: string, value: number | null): Promise<ActionResult> {
  const supabase = createClient();
  const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle<{ id: string }>();
  if (!lead) return { error: "Lead não encontrado." };

  await createAdminClient().from("leads").update({ value, updated_at: new Date().toISOString() }).eq("id", leadId);
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function bringExistingConversationsAction(pipelineId: string): Promise<ActionResult & { enrolled?: number }> {
  const supabase = createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id, account_id").eq("id", pipelineId).maybeSingle<{ id: string; account_id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };

  const enrolled = await enrollExistingConversations(createAdminClient(), pipeline.account_id);
  revalidatePath(FUNIL_PATH);
  revalidatePath(CONVERSAS_PATH);
  return { enrolled };
}

export async function toggleAutoEnrollAction(pipelineId: string, autoEnroll: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle<{ id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };

  await createAdminClient().from("pipelines").update({ auto_enroll: autoEnroll, updated_at: new Date().toISOString() }).eq("id", pipelineId);
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function createStageAction(
  pipelineId: string,
  input: { name: string; color: string; stageType: StageType }
): Promise<ActionResult> {
  const supabase = createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle<{ id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };
  if (!input.name.trim()) return { error: "Dê um nome à etapa." };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("pipeline_stages")
    .select("position")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();

  const { error } = await admin.from("pipeline_stages").insert({
    pipeline_id: pipelineId,
    name: input.name.trim().slice(0, 60),
    color: input.color,
    stage_type: input.stageType,
    position: positionBetween(last ? toNumber(last.position) : null, null),
  });
  if (error) return { error: error.message };
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function updateStageAction(
  stageId: string,
  patch: { name?: string; color?: string; stageType?: StageType; onEnterSequenceId?: string | null }
): Promise<ActionResult> {
  const supabase = createClient();
  const { data: stage } = await supabase.from("pipeline_stages").select("id").eq("id", stageId).maybeSingle<{ id: string }>();
  if (!stage) return { error: "Etapa não encontrada." };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { error: "Dê um nome à etapa." };
    row.name = patch.name.trim().slice(0, 60);
  }
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.stageType !== undefined) row.stage_type = patch.stageType;
  if (patch.onEnterSequenceId !== undefined) row.on_enter_sequence_id = patch.onEnterSequenceId;

  const { error } = await createAdminClient().from("pipeline_stages").update(row).eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function reorderStagesAction(pipelineId: string, orderedStageIds: string[]): Promise<ActionResult> {
  const supabase = createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle<{ id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };

  const admin = createAdminClient();
  const positions = reindexPositions(orderedStageIds.length);
  await Promise.all(
    orderedStageIds.map((id, i) => admin.from("pipeline_stages").update({ position: positions[i] }).eq("id", id).eq("pipeline_id", pipelineId))
  );
  revalidatePath(FUNIL_PATH);
  return {};
}

/** Exclui a etapa movendo os leads dela para `moveLeadsToStageId` primeiro (stage_id é restrict). */
export async function deleteStageAction(stageId: string, moveLeadsToStageId: string): Promise<ActionResult> {
  if (stageId === moveLeadsToStageId) return { error: "Escolha outra etapa de destino." };
  const supabase = createClient();
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_id")
    .eq("id", stageId)
    .maybeSingle<{ id: string; pipeline_id: string }>();
  if (!stage) return { error: "Etapa não encontrada." };
  const { data: destination } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("id", moveLeadsToStageId)
    .eq("pipeline_id", stage.pipeline_id)
    .maybeSingle<{ id: string }>();
  if (!destination) return { error: "Escolha uma etapa de destino do mesmo funil." };

  const admin = createAdminClient();
  const { data: affected } = await admin.from("leads").select("id, account_id").eq("stage_id", stageId);
  await admin
    .from("leads")
    .update({ stage_id: moveLeadsToStageId, entered_stage_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("stage_id", stageId);
  const rows = (affected ?? []) as { id: string; account_id: string }[];
  if (rows.length > 0) {
    await admin.from("lead_stage_events").insert(
      rows.map((lead) => ({
        lead_id: lead.id,
        account_id: lead.account_id,
        from_stage_id: stageId,
        to_stage_id: moveLeadsToStageId,
        source: "system" as const,
        moved_by: null,
      }))
    );
  }
  const { error } = await admin.from("pipeline_stages").delete().eq("id", stageId);
  if (error) return { error: error.message };
  revalidatePath(FUNIL_PATH);
  return {};
}
