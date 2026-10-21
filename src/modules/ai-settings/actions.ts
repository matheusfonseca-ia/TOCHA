"use server";

import { revalidatePath } from "next/cache";

import {
  AI_PROVIDERS,
  isAiProviderId,
  isValidModelId,
  modelFormatHint,
  type AiProviderId,
} from "@/lib/ai/providers";
import { encryptToken } from "@/lib/crypto";
import { isMissingColumn, isMissingTable } from "@/lib/db/missing";
import { createClient } from "@/lib/supabase/server";

import { AI_SETTINGS_TABLE, getAiSettingsStatus, PROVIDER_COLUMN } from "./server";
import { verifyAiKey } from "./services/verify-key";
import type { AiSettingsActionResult } from "./types";

const MIGRATION_ERROR =
  "Para guardar a chave, aplique a migration 0016_user_ai_settings.sql no Supabase.";

/** Painel inteiro depende disso (o layout decide se o botão ✨ aparece). */
function refreshPanel() {
  revalidatePath("/", "layout");
}

/**
 * Guarda a chave (e o modelo) do usuário logado, com o provedor escolhido
 * (OpenRouter ou OpenAI). Chave vazia com chave já cadastrada = só troca o
 * modelo, sem exigir digitar a chave de novo. Trocar de provedor sempre exige
 * colar a chave do provedor novo.
 */
export async function saveAiSettings(input: {
  apiKey?: string;
  model?: string;
  provider?: AiProviderId;
}): Promise<AiSettingsActionResult> {
  const apiKey = input.apiKey?.trim() ?? "";
  const model = input.model?.trim() ?? "";
  // Cliente antigo sem provedor continua sendo OpenRouter.
  const provider: AiProviderId = isAiProviderId(input.provider) ? input.provider : "openrouter";
  const label = AI_PROVIDERS[provider].label;

  if (model && !isValidModelId(model, provider)) {
    return { ok: false, error: modelFormatHint(provider) };
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sessão expirada. Entre de novo." };

  if (!apiKey) {
    const status = await getAiSettingsStatus();
    if (status.migrationMissing) return { ok: false, error: MIGRATION_ERROR };
    if (!status.hasUserKey) return { ok: false, error: `Cole a chave da ${label}.` };
    if (status.provider !== provider) {
      return { ok: false, error: `Para trocar para a ${label}, cole a chave da ${label}.` };
    }

    const { error } = await supabase
      .from(AI_SETTINGS_TABLE)
      .update({ model: model || null, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id);
    if (error) return { ok: false, error: "Não foi possível salvar o modelo." };

    refreshPanel();
    return { ok: true };
  }

  const verdict = await verifyAiKey(provider, apiKey);
  if (!verdict.ok) {
    return {
      ok: false,
      error:
        verdict.reason === "invalid"
          ? `A ${label} não aceitou essa chave. Confere se é a chave da ${label} e se copiou inteira.`
          : "Não consegui validar a chave agora. Tenta de novo em instantes.",
    };
  }

  let encrypted: string;
  try {
    encrypted = encryptToken(apiKey);
  } catch {
    return { ok: false, error: "TOKEN_ENCRYPTION_KEY não está configurada nesta instalação." };
  }

  const row = {
    user_id: auth.user.id,
    api_key_enc: encrypted,
    model: model || null,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase
    .from(AI_SETTINGS_TABLE)
    .upsert({ ...row, [PROVIDER_COLUMN]: provider }, { onConflict: "user_id" });
  // Migration 0018 ainda não aplicada: guarda sem o provedor. A leitura deduz
  // pelo prefixo da chave (sk-or- é OpenRouter), então a chave continua valendo.
  if (isMissingColumn(error, PROVIDER_COLUMN)) {
    ({ error } = await supabase.from(AI_SETTINGS_TABLE).upsert(row, { onConflict: "user_id" }));
  }

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
