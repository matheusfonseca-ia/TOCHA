"use server";

import { revalidatePath } from "next/cache";

import { encryptToken } from "@/lib/crypto";
import { isMissingTable } from "@/lib/db/missing";
import { createClient } from "@/lib/supabase/server";

import { AI_SETTINGS_TABLE, getAiSettingsStatus } from "./server";
import { verifyOpenRouterKey } from "./services/verify-key";
import type { AiSettingsActionResult } from "./types";
import { isValidModelId } from "./utils/key-hint";

const MIGRATION_ERROR =
  "Para guardar a chave, aplique a migration 0016_user_ai_settings.sql no Supabase.";

/** Painel inteiro depende disso (o layout decide se o botão ✨ aparece). */
function refreshPanel() {
  revalidatePath("/", "layout");
}

/**
 * Guarda a chave (e o modelo) do usuário logado. Chave vazia com chave já
 * cadastrada = só troca o modelo, sem exigir digitar a chave de novo.
 */
export async function saveAiSettings(input: {
  apiKey?: string;
  model?: string;
}): Promise<AiSettingsActionResult> {
  const apiKey = input.apiKey?.trim() ?? "";
  const model = input.model?.trim() ?? "";

  if (model && !isValidModelId(model)) {
    return { ok: false, error: "Modelo no formato provedor/nome, por exemplo anthropic/claude-sonnet-4.5." };
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sessão expirada. Entre de novo." };

  if (!apiKey) {
    const status = await getAiSettingsStatus();
    if (status.migrationMissing) return { ok: false, error: MIGRATION_ERROR };
    if (!status.hasUserKey) return { ok: false, error: "Cole a chave da OpenRouter." };

    const { error } = await supabase
      .from(AI_SETTINGS_TABLE)
      .update({ model: model || null, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id);
    if (error) return { ok: false, error: "Não foi possível salvar o modelo." };

    refreshPanel();
    return { ok: true };
  }

  const verdict = await verifyOpenRouterKey(apiKey);
  if (!verdict.ok) {
    return {
      ok: false,
      error:
        verdict.reason === "invalid"
          ? "A OpenRouter não aceitou essa chave. Confere se copiou inteira."
          : "Não consegui validar a chave agora. Tenta de novo em instantes.",
    };
  }

  let encrypted: string;
  try {
    encrypted = encryptToken(apiKey);
  } catch {
    return { ok: false, error: "TOKEN_ENCRYPTION_KEY não está configurada nesta instalação." };
  }

  const { error } = await supabase.from(AI_SETTINGS_TABLE).upsert(
    {
      user_id: auth.user.id,
      api_key_enc: encrypted,
      model: model || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (isMissingTable(error, AI_SETTINGS_TABLE)) return { ok: false, error: MIGRATION_ERROR };
  if (error) return { ok: false, error: "Não foi possível guardar a chave. Tenta de novo." };

  refreshPanel();
  return { ok: true };
}

export async function removeAiSettings(): Promise<AiSettingsActionResult> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const { error } = await supabase.from(AI_SETTINGS_TABLE).delete().eq("user_id", auth.user.id);
  if (error && !isMissingTable(error, AI_SETTINGS_TABLE)) {
    return { ok: false, error: "Não foi possível remover a chave." };
  }

  refreshPanel();
  return { ok: true };
}
