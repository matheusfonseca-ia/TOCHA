import type { createAdminClient } from "@/lib/supabase/admin";

import { ensureDefaultPipeline, firstOpenStage } from "./ensure-default-pipeline";
import { currentLeadOf, moveLead } from "./move-lead";

/**
 * Entrada automática no funil padrão (D2): quem manda a 1ª DM (e qualquer
 * mensagem recebida depois, sem lead no funil) entra sozinho na 1ª etapa
 * aberta. Desligável por funil (`auto_enroll`). Best effort: chamada pela
 * captura do webhook, nunca pode atrapalhar a automação.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export async function enrollLeadFromCapture(
  admin: AdminClient,
  accountId: string,
  conversationId: string,
  igSenderId: string
): Promise<void> {
  try {
    const pipeline = await ensureDefaultPipeline(admin, accountId);
    if (!pipeline.auto_enroll) return;
    // Só cria: lead já existente (inclusive ganho ou perdido) fica onde está.
    // Sem isto, cada DM o devolveria para a 1ª etapa (moveLead move quem já
    // existe) ou abriria um card duplicado para quem já fechou.
    if (await currentLeadOf(admin, pipeline.id, conversationId)) return;
    const stage = await firstOpenStage(admin, pipeline.id);
    if (!stage) return;
    await moveLead(admin, {
      accountId,
      toStageId: stage.id,
      source: "system",
      conversationId,
      igSenderId,
    });
  } catch (err) {
    console.error("[crm] falha ao inscrever lead no funil:", err instanceof Error ? err.message : err);
  }
}

/**
 * "Trazer conversas existentes": inscreve no funil padrão as conversas da
 * conta que ainda não têm lead nele (aberto ou fechado). Usado pelo botão do board, só
 * quando `auto_enroll` estiver ligado (senão o botão mostra o aviso e não
 * chama isto).
 */
export async function enrollExistingConversations(admin: AdminClient, accountId: string): Promise<number> {
  const pipeline = await ensureDefaultPipeline(admin, accountId);
  const stage = await firstOpenStage(admin, pipeline.id);
  if (!stage) return 0;

  const [{ data: conversations }, { data: leads }] = await Promise.all([
    admin.from("conversations").select("id, ig_sender_id").eq("account_id", accountId),
    admin.from("leads").select("conversation_id").eq("pipeline_id", pipeline.id),
  ]);

  const already = new Set(((leads ?? []) as { conversation_id: string }[]).map((l) => l.conversation_id));
  const pending = ((conversations ?? []) as { id: string; ig_sender_id: string }[]).filter((c) => !already.has(c.id));

  let enrolled = 0;
  for (const conversation of pending) {
    const result = await moveLead(admin, {
      accountId,
      toStageId: stage.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: conversation.ig_sender_id,
    });
    if (result.changed) enrolled += 1;
  }
  return enrolled;
}
