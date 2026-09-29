"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { backfillLeadProfiles } from "../../lead-profile/server/refresh-profile";
import { importHistoryBatch } from "../server/import-history";

export interface ImportHistoryStepResult {
  error?: string;
  nextCursor: string | null;
  done: boolean;
  conversationsProcessed: number;
  messagesImported: number;
}

/**
 * Um lote da importação de histórico de DMs. A UI chama esta action em
 * sequência, repassando `nextCursor`, até `done: true` (cada chamada cobre
 * poucas conversas para caber no tempo do Worker). Confere a posse da conta
 * pelo client do usuário (RLS) e só então usa a service role para ler o
 * token e gravar as mensagens.
 */
export async function importHistoryStep(
  accountId: string,
  cursor: string | null
): Promise<ImportHistoryStepResult> {
  const empty = { nextCursor: null, done: true, conversationsProcessed: 0, messagesImported: 0 };

  const supabase = createClient();
  const { data: owned } = await supabase
    .from("ig_accounts")
    .select("id")
    .eq("id", accountId)
    .maybeSingle<{ id: string }>();
  if (!owned) return { ...empty, error: "Conta não encontrada." };

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<IgAccount>();
  if (!account) return { ...empty, error: "Conta não encontrada." };

  try {
    const result = await importHistoryBatch(admin, account, cursor);
    if (result.done) {
      // Conversas novas (criadas agora pela importação) ainda não têm foto
      // nem perfil: preenche antes de mandar o usuário para o Inbox.
      await backfillLeadProfiles(admin, accountId, 200);
      revalidatePath("/crm/conversas");
    }
    return {
      nextCursor: result.nextCursor,
      done: result.done,
      conversationsProcessed: result.conversationsProcessed,
      messagesImported: result.messagesImported,
    };
  } catch (err) {
    return {
      ...empty,
      done: false,
      nextCursor: cursor,
      error: err instanceof Error ? err.message : "Falha ao importar histórico.",
    };
  }
}
