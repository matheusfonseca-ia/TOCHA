/** O que o navegador pode saber sobre a chave: nunca o valor, só se existe e o final. */
export interface AiSettingsStatus {
  /** O usuário logado cadastrou uma chave própria. */
  hasUserKey: boolean;
  /** `••••1234`, quando há chave própria. */
  keyHint: string | null;
  /** Modelo próprio (nulo = o da instalação / padrão). */
  model: string | null;
  /** A instalação tem OPENROUTER_API_KEY, então há IA mesmo sem chave própria. */
  installationKey: boolean;
  /** Migration 0016 ainda não aplicada no Supabase. */
  migrationMissing: boolean;
}

export type AiSettingsActionResult = { ok: true } | { ok: false; error: string };
