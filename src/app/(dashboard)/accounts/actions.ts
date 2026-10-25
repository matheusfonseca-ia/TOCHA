"use server";

import { revalidatePath } from "next/cache";

import { ownedAccountId } from "@/lib/auth/ownership";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error?: string;
}

/**
 * Desconecta a conta: as automações param imediatamente e o token guardado é
 * apagado (a coluna é `not null`, então o valor limpo é a string vazia). Assim
 * o ex-dono não age no @ depois que outro cliente o conecta.
 * Reconectar via OAuth reativa a mesma linha (upsert por user_id + ig_user_id).
 *
 * A policy de `ig_accounts` é só leitura para o usuário (migration 0022): a
 * posse é conferida com o client dele (RLS de select) e a escrita vai pela
 * service role.
 */
export async function disconnectAccount(id: string): Promise<ActionResult> {
  const ownedId = await ownedAccountId(id);
  if (!ownedId) return { error: "Conta não encontrada." };

  const { error } = await createAdminClient()
    .from("ig_accounts")
    .update({ status: "disconnected", access_token_enc: "", token_expires_at: null })
    .eq("id", ownedId);

  if (error) return { error: "Não foi possível desconectar a conta." };

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/rules");
  return {};
}
