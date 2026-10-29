"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { activeUserId } from "@/lib/auth/require-access";
import { startStageEnterSequence } from "@/lib/sequences/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { enrollExistingConversations } from "../server/enroll-lead";
import { closingFields, moveLead } from "../server/move-lead";
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

const NO_ACCESS = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";

// Entradas das actions (A1-020): ids como texto curto, números finitos e
// dentro de faixa, cor só em hex e tipo de etapa só do enum.
const id = z.string().min(1).max(64);
const stageType = z.enum(["open", "won", "lost"]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const MAX_VALUE = 1e12;

const moveLeadSchema = z.object({
  leadId: id,
  toStageId: id,
  position: z.number().finite().optional(),
  lostReason: z.string().max(500).optional(),
});
const stageInputSchema = z.object({ name: z.string().max(200), color: hexColor, stageType });
const stagePatchSchema = z.object({
  name: z.string().max(200).optional(),
  color: hexColor.optional(),
  stageType: stageType.optional(),
  onEnterSequenceId: id.nullable().optional(),
});

/** Erro do banco: o texto cru (tabela, constraint, policy) só vai para o log. */
function dbError(context: string, message: string, friendly: string): ActionResult {
  console.error(`[crm] ${context}:`, message);
  return { error: friendly };
}

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
    if (account) await startStageEnterSequence(admin, account, senderId, sequenceId);
  } catch (err) {
    console.error("[crm] workflow de entrada da etapa falhou:", err instanceof Error ? err.message : err);
  }
}

export async function moveLeadAction(raw: {
  leadId: string;
  toStageId: string;
  position?: number;
  lostReason?: string;
}): Promise<ActionResult> {
  const parsed = moveLeadSchema.safeParse(raw);
  if (!parsed.success) return { error: "Dados inválidos para mover o lead." };
  const input = parsed.data;
  const userId = await activeUserId();
  if (!userId) return { error: NO_ACCESS };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, account_id")
    .eq("id", input.leadId)
    .maybeSingle<{ id: string; account_id: string }>();
  if (!lead) return { error: "Lead não encontrado." };

  const admin = createAdminClient();
  try {
    const result = await moveLead(admin, {
      accountId: lead.account_id,
      toStageId: input.toStageId,
      source: "manual",
      movedBy: userId,
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
    console.error("[crm] falha ao mover lead:", err instanceof Error ? err.message : err);
    return { error: "Não foi possível mover o lead. Tente de novo." };
  }
}

/** Ficha do lead pro drawer do board: carregada sob demanda, ao abrir o card. */
export async function getLeadDetailAction(leadId: string): Promise<LeadDetail | null> {
  if (!id.safeParse(leadId).success || !(await activeUserId())) return null;
  return getLeadDetail(await createClient(), leadId);
}

/** "Carregar mais" de uma coluna do board. */
export async function loadMoreLeadsAction(
  pipelineId: string,
  stageId: string,
  afterPosition: number
): Promise<{ cards: BoardLeadCard[]; hasMore: boolean }> {
  const valid = id.safeParse(pipelineId).success && id.safeParse(stageId).success && Number.isFinite(afterPosition);
  if (!valid || !(await activeUserId())) return { cards: [], hasMore: false };
  return loadMoreStageLeads(await createClient(), pipelineId, stageId, afterPosition);
}

export async function updateLeadValueAction(leadId: string, value: number | null): Promise<ActionResult> {
  if (!id.safeParse(leadId).success) return { error: "Lead não encontrado." };
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_VALUE)) {
    return { error: "Valor inválido." };
  }
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle<{ id: string }>();
  if (!lead) return { error: "Lead não encontrado." };

  const { error } = await createAdminClient().from("leads").update({ value, updated_at: new Date().toISOString() }).eq("id", leadId);
  if (error) return dbError("falha ao salvar valor do lead", error.message, "Não foi possível salvar o valor.");
  revalidatePath(FUNIL_PATH);
  return {};
}

/**
 * Um lote de "Trazer conversas existentes". A UI chama de novo com
 * `nextCursor` até vir null (cada chamada cobre uma página de conversas, para
 * caber no tempo do Worker).
 */
export async function bringExistingConversationsAction(
  pipelineId: string,
  cursor: string | null = null
): Promise<ActionResult & { enrolled?: number; nextCursor?: string | null }> {
  if (!id.safeParse(pipelineId).success || (cursor !== null && !id.safeParse(cursor).success)) {
    return { error: "Funil não encontrado." };
  }
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id, account_id").eq("id", pipelineId).maybeSingle<{ id: string; account_id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };

  try {
    const { enrolled, nextCursor } = await enrollExistingConversations(createAdminClient(), pipeline.account_id, cursor);
    if (!nextCursor) {
      revalidatePath(FUNIL_PATH);
      revalidatePath(CONVERSAS_PATH);
    }
    return { enrolled, nextCursor };
  } catch (err) {
    console.error("[crm] falha ao trazer conversas existentes:", err instanceof Error ? err.message : err);
    return { error: "Não foi possível trazer as conversas. Tente de novo." };
  }
}

export async function toggleAutoEnrollAction(pipelineId: string, autoEnroll: boolean): Promise<ActionResult> {
  if (!id.safeParse(pipelineId).success || typeof autoEnroll !== "boolean") return { error: "Funil não encontrado." };
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
  const { data: pipeline } = await supabase.from("pipelines").select("id").eq("id", pipelineId).maybeSingle<{ id: string }>();
  if (!pipeline) return { error: "Funil não encontrado." };

  await createAdminClient().from("pipelines").update({ auto_enroll: autoEnroll, updated_at: new Date().toISOString() }).eq("id", pipelineId);
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function createStageAction(
  pipelineId: string,
  raw: { name: string; color: string; stageType: StageType }
): Promise<ActionResult> {
  const parsed = stageInputSchema.safeParse(raw);
  if (!id.safeParse(pipelineId).success || !parsed.success) return { error: "Dados inválidos para a etapa." };
  const input = parsed.data;
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
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
  if (error) return dbError("falha ao criar etapa", error.message, "Não foi possível criar a etapa.");
  revalidatePath(FUNIL_PATH);
  return {};
}

export async function updateStageAction(
  stageId: string,
  rawPatch: { name?: string; color?: string; stageType?: StageType; onEnterSequenceId?: string | null }
): Promise<ActionResult> {
  const parsed = stagePatchSchema.safeParse(rawPatch);
  if (!id.safeParse(stageId).success || !parsed.success) return { error: "Dados inválidos para a etapa." };
  const patch = parsed.data;
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, stage_type")
    .eq("id", stageId)
    .maybeSingle<{ id: string; stage_type: StageType }>();
  if (!stage) return { error: "Etapa não encontrada." };

  // O workflow de entrada tem que ser do próprio usuário: a referência de
  // outro cliente não pode nem ser gravada (o RLS de sequences filtra).
  if (patch.onEnterSequenceId) {
    const { data: sequence } = await supabase
      .from("sequences")
      .select("id")
      .eq("id", patch.onEnterSequenceId)
      .maybeSingle<{ id: string }>();
    if (!sequence) return { error: "Workflow não encontrado." };
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) return { error: "Dê um nome à etapa." };
    row.name = patch.name.trim().slice(0, 60);
  }
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.stageType !== undefined) row.stage_type = patch.stageType;
  if (patch.onEnterSequenceId !== undefined) row.on_enter_sequence_id = patch.onEnterSequenceId;

  const admin = createAdminClient();
  const { error } = await admin.from("pipeline_stages").update(row).eq("id", stageId);
  if (error) return dbError("falha ao salvar etapa", error.message, "Não foi possível salvar a etapa.");
  if (patch.stageType !== undefined && patch.stageType !== stage.stage_type) {
    await syncStageClosing(admin, stageId, patch.stageType);
  }
  revalidatePath(FUNIL_PATH);
  return {};
}

/**
 * Etapa mudou de tipo: os leads dela passam a valer o tipo novo (fechar em
 * ganho/perdido, reabrir em aberta), a mesma regra do moveLead.
 */
async function syncStageClosing(admin: ReturnType<typeof createAdminClient>, stageId: string, stageType: StageType) {
  const leads = () => admin.from("leads");
  const now = new Date().toISOString();
  if (stageType === "open") {
    await leads().update({ closed_at: null, lost_reason: null, updated_at: now }).eq("stage_id", stageId);
    return;
  }
  await leads().update({ closed_at: now, updated_at: now }).eq("stage_id", stageId).is("closed_at", null);
  if (stageType === "won") await leads().update({ lost_reason: null }).eq("stage_id", stageId);
}

export async function reorderStagesAction(pipelineId: string, orderedStageIds: string[]): Promise<ActionResult> {
  if (!id.safeParse(pipelineId).success || !z.array(id).max(50).safeParse(orderedStageIds).success) {
    return { error: "Dados inválidos para reordenar." };
  }
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
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
  if (!id.safeParse(stageId).success || !id.safeParse(moveLeadsToStageId).success) return { error: "Etapa não encontrada." };
  if (stageId === moveLeadsToStageId) return { error: "Escolha outra etapa de destino." };
  if (!(await activeUserId())) return { error: NO_ACCESS };
  const supabase = await createClient();
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_id")
    .eq("id", stageId)
    .maybeSingle<{ id: string; pipeline_id: string }>();
  if (!stage) return { error: "Etapa não encontrada." };
  const { data: destination } = await supabase
    .from("pipeline_stages")
    .select("id, stage_type")
    .eq("id", moveLeadsToStageId)
    .eq("pipeline_id", stage.pipeline_id)
    .maybeSingle<{ id: string; stage_type: StageType }>();
  if (!destination) return { error: "Escolha uma etapa de destino do mesmo funil." };

  const admin = createAdminClient();
  const [{ data: affected }, { data: last }] = await Promise.all([
    admin
      .from("leads")
      .select("id, account_id, closed_at, lost_reason")
      .eq("stage_id", stageId)
      .order("position", { ascending: true }),
    admin
      .from("leads")
      .select("position")
      .eq("stage_id", moveLeadsToStageId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>(),
  ]);
  const rows = (affected ?? []) as { id: string; account_id: string; closed_at: string | null; lost_reason: string | null }[];

  // Vão para o fim da coluna de destino, na mesma ordem, e passam a valer o
  // tipo dela (fechar em ganho/perdido, reabrir em aberta).
  const now = new Date().toISOString();
  let position = last ? toNumber(last.position) : null;
  const updates = rows.map((lead) => {
    position = positionBetween(position, null);
    return admin
      .from("leads")
      .update({
        stage_id: moveLeadsToStageId,
        position,
        entered_stage_at: now,
        updated_at: now,
        ...closingFields(destination.stage_type, lead.lost_reason, lead.closed_at),
      })
      .eq("id", lead.id);
  });
  const results = await Promise.all(updates);
  // Histórico só de quem de fato mudou: se parte falhar, repetir a exclusão
  // move só quem ficou para trás, sem evento duplicado nem faltando.
  const moved = rows.filter((_, i) => !results[i].error);
  const failed = results.find((r) => r.error);

  if (moved.length > 0) {
    await admin.from("lead_stage_events").insert(
      moved.map((lead) => ({
        lead_id: lead.id,
        account_id: lead.account_id,
        from_stage_id: stageId,
        to_stage_id: moveLeadsToStageId,
        source: "system" as const,
        moved_by: null,
      }))
    );
  }
  if (failed?.error) {
    return dbError("falha ao mover leads da etapa excluída", failed.error.message, "Não foi possível mover os leads da etapa. Tente de novo.");
  }
  const { error } = await admin.from("pipeline_stages").delete().eq("id", stageId);
  if (error) return dbError("falha ao excluir etapa", error.message, "Não foi possível excluir a etapa.");
  revalidatePath(FUNIL_PATH);
  return {};
}
