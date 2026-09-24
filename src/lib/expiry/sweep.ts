import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ExpireResult {
  deleted: number;
  paused: number;
}

const TABLES = ["rules", "sequences"] as const;

/**
 * Aplica a ação de expiração em tudo que venceu até `nowIso`:
 *  - delete: apaga a linha (sequence_runs caem em cascata; workflow que usava
 *    a rule como entrada fica com o nó "Automação removida", como na
 *    exclusão manual);
 *  - pause: `is_active = false`, mantendo `expires_at` para a lista mostrar
 *    "Expirada". O filtro `is_active = true` impede repausar a cada tick.
 * Lança em erro de banco (ex.: migration 0003 não aplicada): quem chama
 * decide se isso derruba ou não (ver expireAutomationsSafe).
 */
export async function expireAutomations(
  admin: AdminClient,
  nowIso: string = new Date().toISOString()
): Promise<ExpireResult> {
  const result: ExpireResult = { deleted: 0, paused: 0 };

  for (const table of TABLES) {
    const { data: deleted, error: deleteError } = await admin
      .from(table)
      .delete()
      .lte("expires_at", nowIso)
      .eq("expire_action", "delete")
      .select("id");
    if (deleteError) throw new Error(`${table}: ${deleteError.message}`);

    const { data: paused, error: pauseError } = await admin
      .from(table)
      .update({ is_active: false, updated_at: nowIso })
      .lte("expires_at", nowIso)
      .eq("expire_action", "pause")
      .eq("is_active", true)
      .select("id");
    if (pauseError) throw new Error(`${table}: ${pauseError.message}`);

    const d = deleted?.length ?? 0;
    const p = paused?.length ?? 0;
    if (d || p) {
      console.info(`[expiry] ${table}: ${d} excluída(s), ${p} pausada(s)`);
    }
    result.deleted += d;
    result.paused += p;
  }

  return result;
}

/** Versão que nunca lança (webhook e cron não podem cair por causa do sweep). */
export async function expireAutomationsSafe(
  admin: AdminClient = createAdminClient(),
  nowIso?: string
): Promise<ExpireResult | null> {
  try {
    return await expireAutomations(admin, nowIso);
  } catch (err) {
    console.warn(
      "[expiry] falha ao expirar automações:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
