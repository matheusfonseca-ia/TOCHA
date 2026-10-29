"use server";

import { revalidatePath } from "next/cache";

import { activeUserId } from "@/lib/auth/require-access";
import { decryptToken } from "@/lib/crypto";
import { subscribeAccountToWebhooks } from "@/lib/meta/graph";
import { createClient } from "@/lib/supabase/server";

import type { ActionResult } from "./actions";

/**
 * Refaz a inscrição da conta nos webhooks da Meta (`me/subscribed_apps`). Usada
 * quando a inscrição falhou no OAuth: sem ela nenhuma automação dispara.
 * Só lê, e com o client do usuário (o RLS de select só devolve a conta se for
 * dele): nada é escrito no banco, então não precisa da service role.
 */
export async function resubscribeAccount(id: string): Promise<ActionResult> {
  if (!(await activeUserId())) return { error: "Sua assinatura não está ativa." };

  const { data } = await createClient()
    .from("ig_accounts")
    .select("status, access_token_enc")
    .eq("id", id)
    .maybeSingle<{ status: string; access_token_enc: string }>();
  if (!data) return { error: "Conta não encontrada." };

  let token: string | null = null;
  if (data.status === "active" && data.access_token_enc) {
    try {
      token = decryptToken(data.access_token_enc);
    } catch {
      token = null;
    }
  }
  if (!token) return { error: "Conecte a conta de novo pelo botão Conectar Instagram." };

  try {
    await subscribeAccountToWebhooks(token);
  } catch (err) {
    console.warn(
      `[accounts] nova tentativa de inscrição no webhook falhou (${id}):`,
      err instanceof Error ? err.message : err
    );
    return { error: "A Meta recusou de novo. Confira as permissões concedidas e tente reconectar a conta." };
  }
  revalidatePath("/accounts");
  return {};
}
