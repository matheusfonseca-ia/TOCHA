import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptToken } from "@/lib/crypto";
import { isMissingTable } from "@/lib/db/missing";
import { aiConfigFromEnv, type AiConfig } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";

import { resolveAiConfig } from "./services/resolve-config";
import type { AiSettingsStatus } from "./types";
import { keyHint } from "./utils/key-hint";

/**
 * Leitura server-side das configurações de IA. A chave decifrada só existe
 * aqui; o que sobe pro client é `AiSettingsStatus`.
 */

export const AI_SETTINGS_TABLE = "user_ai_settings";

interface UserRow {
  api_key_enc: string;
  model: string | null;
}

async function readUserRow(
  supabase: SupabaseClient
): Promise<{ row: UserRow | null; migrationMissing: boolean; authenticated: boolean }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { row: null, migrationMissing: false, authenticated: false };

  const { data, error } = await supabase
    .from(AI_SETTINGS_TABLE)
    .select("api_key_enc, model")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (isMissingTable(error, AI_SETTINGS_TABLE)) {
    return { row: null, migrationMissing: true, authenticated: true };
  }
  return { row: (data as UserRow | null) ?? null, migrationMissing: false, authenticated: true };
}

/** Decifra; chave que não abre (TOKEN_ENCRYPTION_KEY trocada) conta como ausente. */
function decryptOrNull(enc: string): string | null {
  try {
    return decryptToken(enc);
  } catch {
    return null;
  }
}

/** Config que o botão ✨ usa agora: chave do usuário logado, senão a da instalação. */
export async function getEffectiveAiConfig(): Promise<AiConfig | null> {
  const { row, authenticated } = await readUserRow(createClient());
  // Sem sessão não há IA: senão qualquer um gastaria a chave da instalação.
  if (!authenticated) return null;
  const apiKey = row ? decryptOrNull(row.api_key_enc) : null;

  return resolveAiConfig(apiKey ? { apiKey, model: row!.model } : null, aiConfigFromEnv());
}

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  const { row, migrationMissing } = await readUserRow(createClient());
  const apiKey = row ? decryptOrNull(row.api_key_enc) : null;

  return {
    hasUserKey: apiKey !== null,
    keyHint: apiKey ? keyHint(apiKey) : null,
    model: apiKey ? row!.model : null,
    installationKey: aiConfigFromEnv() !== null,
    migrationMissing,
  };
}
