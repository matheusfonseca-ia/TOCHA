import type { createClient } from "@/lib/supabase/server";

import { isExpired } from "./expiry";

type ServerClient = ReturnType<typeof createClient>;

export const EXPIRED_RULE_ACTIVATION_ERROR =
  'Esta automação já expirou. Use "Estender expiração" para ativá-la de novo.';
export const EXPIRED_SEQUENCE_ACTIVATION_ERROR =
  'Este workflow já expirou. Use "Estender expiração" na lista para ativá-lo de novo.';

/**
 * Ativar algo vencido não teria efeito (o matching ignora e o sweep pausa de
 * novo), então as actions recusam e apontam para "Estender expiração". Erro
 * na leitura (ex.: migration 0003 não aplicada) não bloqueia.
 */
export async function isStoredExpired(
  supabase: ServerClient,
  table: "rules" | "sequences",
  id: string
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select("expires_at")
    .eq("id", id)
    .maybeSingle();
  return isExpired(data?.expires_at as string | null | undefined);
}
