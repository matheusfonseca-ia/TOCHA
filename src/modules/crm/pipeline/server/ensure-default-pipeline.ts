import type { createAdminClient } from "@/lib/supabase/admin";

import { reindexPositions } from "../utils/fractional-index";
import type { Pipeline, PipelineStage, StageType } from "../types";

/**
 * Funil padrão da conta (D2): criado na 1ª visita ao Funil ou na 1ª entrada
 * automática, o que vier primeiro. Idempotente: corrida entre os dois
 * gatilhos bate no índice único parcial (`pipelines_one_default_per_account`)
 * e simplesmente relê o que o outro já criou.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const DEFAULT_STAGES: { name: string; stage_type: StageType; color: string }[] = [
  { name: "Novos", stage_type: "open", color: "#3b82f6" },
  { name: "Em conversa", stage_type: "open", color: "#a855f7" },
  { name: "Negociando", stage_type: "open", color: "#f59e0b" },
  { name: "Ganho", stage_type: "won", color: "#22c55e" },
  { name: "Perdido", stage_type: "lost", color: "#ef4444" },
];

const PG_UNIQUE_VIOLATION = "23505";

export async function ensureDefaultPipeline(admin: AdminClient, accountId: string): Promise<Pipeline> {
  const existing = await admin
    .from("pipelines")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_default", true)
    .maybeSingle<Pipeline>();
  if (existing.data) return existing.data;

  const { data: created, error } = await admin
    .from("pipelines")
    .insert({ account_id: accountId, name: "Funil padrão", is_default: true, auto_enroll: true })
    .select("*")
    .maybeSingle<Pipeline>();

  if (!created) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      const race = await admin
        .from("pipelines")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_default", true)
        .maybeSingle<Pipeline>();
      if (race.data) return race.data;
    }
    throw new Error(`funil padrão não criado: ${error?.message ?? "sem linha"}`);
  }

  const positions = reindexPositions(DEFAULT_STAGES.length);
  const { error: stagesError } = await admin.from("pipeline_stages").insert(
    DEFAULT_STAGES.map((stage, i) => ({
      pipeline_id: created.id,
      name: stage.name,
      stage_type: stage.stage_type,
      color: stage.color,
      position: positions[i],
    }))
  );
  if (stagesError) throw new Error(`etapas padrão não criadas: ${stagesError.message}`);

  return created;
}

/** 1ª etapa aberta do funil (menor posição): destino da entrada automática. */
export async function firstOpenStage(admin: AdminClient, pipelineId: string): Promise<PipelineStage | null> {
  const { data } = await admin
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .eq("stage_type", "open")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle<PipelineStage>();
  return data ?? null;
}
