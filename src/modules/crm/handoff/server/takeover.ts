import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Assumir conversa" (D3): enquanto `conversations.human_takeover_at` está
 * preenchido, nenhuma automação roda para aquela pessoa (nem regra nova,
 * nem workflow novo, nem a continuação de um workflow parado esperando
 * resposta ou atraso agendado). Só "Devolver ao bot" (limpar a coluna) libera
 * de novo. Checado pelo webhook (`process.ts`) e pelo tick de atrasos
 * (`runtime.ts`), sempre antes de qualquer automação.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export async function isTakenOver(
  admin: AdminClient,
  accountId: string,
  igSenderId: string
): Promise<boolean> {
  const { data } = await admin
    .from("conversations")
    .select("human_takeover_at")
    .eq("account_id", accountId)
    .eq("ig_sender_id", igSenderId)
    .maybeSingle<{ human_takeover_at: string | null }>();
  return Boolean(data?.human_takeover_at);
}

/**
 * Grava ou limpa o handoff pelo id da conversa (usado pelo painel: assumir,
 * devolver ao bot, e o próprio envio de mensagem pelo painel, que assume
 * sozinho). Sempre com a service role: quem chama já confirmou a posse.
 */
export async function setTakeover(
  admin: AdminClient,
  conversationId: string,
  takenOver: boolean
): Promise<void> {
  await admin
    .from("conversations")
    .update({ human_takeover_at: takenOver ? new Date().toISOString() : null })
    .eq("id", conversationId);
}
