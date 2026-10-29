"use server";

import { activeUserId } from "@/lib/auth/require-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * "Apagar para mim" (Fase 7): a mensagem some só do Falow (`hidden_at`), o
 * contato continua vendo no Instagram: a API não tem endpoint pra desfazer
 * um envio ou apagar de verdade (confirmado na Fase 0).
 */
export async function hideMessageForMe(messageId: string): Promise<void> {
  if (!(await activeUserId())) return;
  const supabase = await createClient();
  const { data } = await supabase
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
