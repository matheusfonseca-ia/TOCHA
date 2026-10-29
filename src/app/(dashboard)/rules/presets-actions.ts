"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAiFieldKind, type AiFieldKind } from "@/lib/ai/fields";
import { activeUserId } from "@/lib/auth/require-access";
import { isMissingTable } from "@/lib/db/missing";
import { normalizePreset, type MessagePreset } from "@/lib/presets/presets";
import { createClient } from "@/lib/supabase/server";

/**
 * Textos salvos ("mensagens padrão"). Banco sem a migration 0014 devolve
 * lista vazia em vez de erro: o botão 📌 some da tela e o resto do painel
 * continua funcionando.
 */

const PRESETS_MIGRATION_ERROR =
  "Para salvar textos, aplique a migration 0014_message_presets.sql no Supabase.";
const NO_ACCESS_ERROR = "Sua assinatura não está ativa. Acesse Minha assinatura para reativar.";
const NOT_FOUND_ERROR = "Texto não encontrado. Atualize a página e tente de novo.";
const uuid = z.guid();

export async function listPresets(): Promise<MessagePreset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_presets")
    .select("id, account_id, scope, label, text, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return [];
  return (data ?? []) as MessagePreset[];
}

export type PresetActionResult = { id: string } | { error: string };

export async function savePreset(input: {
  accountId: string;
  scope: AiFieldKind;
  text: string;
  label?: string | null;
}): Promise<PresetActionResult> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  // Escopo e conta conferidos em runtime: a action pode ser chamada direto.
  if (!uuid.safeParse(input.accountId).success || !isAiFieldKind(input.scope) || typeof input.text !== "string") {
    return { error: "Texto inválido. Atualize a página e tente de novo." };
  }
  const normalized = normalizePreset(input);
  if ("error" in normalized) return normalized;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_presets")
    .insert({ account_id: input.accountId, ...normalized.preset })
    .select("id")
    .maybeSingle();

  if (isMissingTable(error, "message_presets")) {
    return { error: PRESETS_MIGRATION_ERROR };
  }
  if (error || !data) {
    return { error: "Não foi possível salvar o texto. Tente novamente." };
  }

  revalidatePath("/rules");
  return { id: data.id as string };
}

export async function deletePreset(id: string): Promise<{ error?: string }> {
  if (!(await activeUserId())) return { error: NO_ACCESS_ERROR };
  if (!uuid.safeParse(id).success) return { error: NOT_FOUND_ERROR };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_presets")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Não foi possível apagar o texto." };
  if (!data) return { error: NOT_FOUND_ERROR };

  revalidatePath("/rules");
  return {};
}
