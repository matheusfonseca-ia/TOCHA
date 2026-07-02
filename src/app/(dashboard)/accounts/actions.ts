"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

/**
 * Desconecta a conta: as automações param imediatamente.
 * Reconectar via OAuth reativa a mesma linha (upsert por user_id + ig_user_id).
 */
export async function disconnectAccount(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("ig_accounts")
    .update({ status: "disconnected" })
    .eq("id", id);

  if (error) return { error: "Não foi possível desconectar a conta." };

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/rules");
  return {};
}
