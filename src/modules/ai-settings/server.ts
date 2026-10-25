import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptToken } from "@/lib/crypto";
import { isMissingTable } from "@/lib/db/missing";
import { aiConfigFromEnv, type AiConfig } from "@/lib/ai/provider";
import { isAdmin } from "@/lib/billing/access";
import { inferProviderFromKey, isAiProviderId, type AiProviderId } from "@/lib/ai/providers";
import { createClient } from "@/lib/supabase/server";

import { resolveAiConfig } from "./services/resolve-config";
import type { AiSettingsStatus } from "./types";
import { keyHint } from "./utils/key-hint";

/**
 * Leitura server-side das configurações de IA. A chave decifrada só existe
 * aqui; o que sobe pro client é `AiSettingsStatus`.
 */

export const AI_SETTINGS_TABLE = "user_ai_settings";

/** Coluna da migration 0018; ausente ou nula (0019) cai na inferência pelo prefixo da chave. */
export const PROVIDER_COLUMN = "provider";

interface UserRow {
  api_key_enc: string;
  model: string | null;
  provider?: string | null;
}

/** Provedor guardado; sem a coluna (ou valor estranho) deduz pelo prefixo da chave. */
function providerOf(row: UserRow, apiKey: string): AiProviderId {
  return isAiProviderId(row.provider) ? row.provider : inferProviderFromKey(apiKey);
}

async function readUserRow(
  supabase: SupabaseClient
): Promise<{ row: UserRow | null; migrationMissing: boolean; userId: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { row: null, migrationMissing: false, userId: null };

  // `*` numa query só: sem a migration 0018 (ou com `provider` nulo, 0019) o
  // campo vem ausente/nulo e `providerOf` deduz pelo prefixo da chave. Evita
  // uma query que falha a cada navegação do painel. A linha é só do usuário
  // (RLS) e nunca sobe inteira pro client.
  const { data, error } = await supabase
    .from(AI_SETTINGS_TABLE)
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (isMissingTable(error, AI_SETTINGS_TABLE)) {
    return { row: null, migrationMissing: true, userId: auth.user.id };
  }
  return { row: (data as UserRow | null) ?? null, migrationMissing: false, userId: auth.user.id };
}

/**
 * Chave padrão da instalação, só para o dono e os admins. O custo dela é do
 * dono: cliente usa a própria chave (tela Contas) ou fica sem o botão.
 */
function installationConfigFor(userId: string): AiConfig | null {
  return isAdmin(userId) ? aiConfigFromEnv() : null;
}

/** Decifra; chave que não abre (TOKEN_ENCRYPTION_KEY trocada) conta como ausente. */
function decryptOrNull(enc: string): string | null {
  try {
    return decryptToken(enc);
  } catch {
    return null;
  }
}

/** Config que o botão ✨ usa agora: chave do usuário logado, senão a da instalação (só dono e admins). */
export async function getEffectiveAiConfig(): Promise<AiConfig | null> {
  const { row, userId } = await readUserRow(createClient());
  // Sem sessão não há IA: senão qualquer um gastaria a chave da instalação.
  if (!userId) return null;
  const apiKey = row ? decryptOrNull(row.api_key_enc) : null;

  return resolveAiConfig(
    apiKey ? { apiKey, model: row!.model, provider: providerOf(row!, apiKey) } : null,
    installationConfigFor(userId)
  );
}

export async function getAiSettingsStatus(): Promise<AiSettingsStatus> {
  const { row, migrationMissing, userId } = await readUserRow(createClient());
  const apiKey = row ? decryptOrNull(row.api_key_enc) : null;
  const installation = userId ? installationConfigFor(userId) : null;

  return {
    hasUserKey: apiKey !== null,
    keyHint: apiKey ? keyHint(apiKey) : null,
    provider: apiKey ? providerOf(row!, apiKey) : null,
    model: apiKey ? row!.model : null,
    installationKey: installation !== null,
    installationProvider: installation?.provider ?? null,
    migrationMissing,
  };
}
