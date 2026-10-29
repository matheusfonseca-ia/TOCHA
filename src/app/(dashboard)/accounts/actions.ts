"use server";

import { revalidatePath } from "next/cache";

import { ownedAccountId } from "@/lib/auth/ownership";
import { decryptToken } from "@/lib/crypto";
import { unsubscribeAccountFromWebhooks } from "@/lib/meta/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error?: string;
}

/** Token decifrado da conta, ou null (já apagado, chave trocada, erro de leitura). */
async function accountToken(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<string | null> {
  const { data } = await admin
    .from("ig_accounts")
    .select("access_token_enc")
    .eq("id", accountId)
    .maybeSingle();
  const enc = (data as { access_token_enc?: string } | null)?.access_token_enc;
  if (!enc) return null;
  try {
    return decryptToken(enc);
  } catch {
    return null;
  }
}

/**
 * Desconecta a conta: as automações param imediatamente e o token guardado é
 * apagado (a coluna é `not null`, então o valor limpo é a string vazia). Assim
 * o ex-dono não age no @ depois que outro cliente o conecta.
 * Antes de apagar o token, tenta (best effort) desfazer a inscrição do app no
 * webhook da conta, para a Meta parar de mandar os eventos do @.
 * Reconectar via OAuth reativa a mesma linha (upsert por user_id + ig_user_id).
 *
 * A policy de `ig_accounts` é só leitura para o usuário (migration 0022): a
 * posse é conferida com o client dele (RLS de select) e a escrita vai pela
 * service role.
 */
export async function disconnectAccount(id: string): Promise<ActionResult> {
  const ownedId = await ownedAccountId(id);
  if (!ownedId) return { error: "Conta não encontrada." };

  const admin = createAdminClient();
  const token = await accountToken(admin, ownedId);
  if (token) {
    try {
      await unsubscribeAccountFromWebhooks(token);
    } catch (err) {
      console.warn(
        `[accounts] não foi possível desfazer a inscrição no webhook da conta ${ownedId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const { error } = await admin
    .from("ig_accounts")
    .update({ status: "disconnected", access_token_enc: "", token_expires_at: null })
    .eq("id", ownedId);

  if (error) return { error: "Não foi possível desconectar a conta." };

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/rules");
  return {};
}
