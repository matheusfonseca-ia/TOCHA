"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * "Apagar para mim" (Fase 7): a mensagem some só do Falow (`hidden_at`), o
 * contato continua vendo no Instagram: a API não tem endpoint pra desfazer
 * um envio ou apagar de verdade (confirmado na Fase 0).
 */
export async function hideMessageForMe(messageId: string): Promise<void> {
  const { data } = await createClient()
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle<{ id: string }>();
  if (!data) return;

  await createAdminClient()
    .from("messages")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", data.id);
}
