import type { createAdminClient } from "@/lib/supabase/admin";

import { ensureDefaultPipeline, firstOpenStage } from "./ensure-default-pipeline";
import { currentLeadOf, endOfColumnPosition, moveLead } from "./move-lead";
import { positionBetween } from "../utils/fractional-index";

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

/** Conversas por chamada de "Trazer conversas existentes" (cabe no tempo do Worker). */
export const ENROLL_PAGE = 200;

/**
 * "Trazer conversas existentes": inscreve no funil padrão as conversas da
 * conta que ainda não têm lead nele (aberto ou fechado). Usado pelo botão do board, só
 * quando `auto_enroll` estiver ligado (senão o botão mostra o aviso e não
 * chama isto).
 *
 * Uma página de conversas por chamada (cursor pelo id, sem o teto de 1000
 * linhas do PostgREST), com os leads da página criados num único insert em
 * vez de um moveLead por conversa. `nextCursor` null = acabou.
 */
export async function enrollExistingConversations(
  admin: AdminClient,
  accountId: string,
  cursor: string | null = null
): Promise<{ enrolled: number; nextCursor: string | null }> {
  const pipeline = await ensureDefaultPipeline(admin, accountId);
  const stage = await firstOpenStage(admin, pipeline.id);
  if (!stage) return { enrolled: 0, nextCursor: null };

  let query = admin
    .from("conversations")
    .select("id, ig_sender_id")
    .eq("account_id", accountId)
    .order("id", { ascending: true })
    .limit(ENROLL_PAGE);
  if (cursor) query = query.gt("id", cursor);
  const { data: conversationRows, error } = await query;
  if (error) throw new Error(`conversas não lidas: ${error.message}`);
  const conversations = (conversationRows ?? []) as { id: string; ig_sender_id: string }[];
  const nextCursor = conversations.length === ENROLL_PAGE ? conversations[conversations.length - 1].id : null;
  if (conversations.length === 0) return { enrolled: 0, nextCursor };

  const { data: leads } = await admin
    .from("leads")
    .select("conversation_id")
    .eq("pipeline_id", pipeline.id)
    .in("conversation_id", conversations.map((c) => c.id));
  const already = new Set(((leads ?? []) as { conversation_id: string }[]).map((l) => l.conversation_id));
  const pending = conversations.filter((c) => !already.has(c.id));
  if (pending.length === 0) return { enrolled: 0, nextCursor };

  let position = await endOfColumnPosition(admin, pipeline.id, stage.id);
  const now = new Date().toISOString();
  const rows = pending.map((conversation, i) => {
    if (i > 0) position = positionBetween(position, null);
    return {
      pipeline_id: pipeline.id,
      account_id: accountId,
      conversation_id: conversation.id,
      ig_sender_id: conversation.ig_sender_id,
      stage_id: stage.id,
      value: null,
      position,
      entered_stage_at: now,
      closed_at: null,
      lost_reason: null,
    };
  });

  const { data: created, error: insertError } = await admin.from("leads").insert(rows).select("id");
  if (!insertError) {
    const ids = ((created ?? []) as { id: string }[]).map((l) => l.id);
    if (ids.length > 0) {
      await admin.from("lead_stage_events").insert(
        ids.map((leadId) => ({
          lead_id: leadId,
          account_id: accountId,
          from_stage_id: null,
          to_stage_id: stage.id,
          source: "system" as const,
          moved_by: null,
        }))
      );
    }
    return { enrolled: ids.length, nextCursor };
  }

  // Corrida com a entrada automática (23505 no lote inteiro): cai para o
  // caminho de uma em uma, que trata o conflito por conversa.
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
  return { enrolled, nextCursor };
}
