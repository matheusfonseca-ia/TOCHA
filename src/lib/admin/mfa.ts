/**
 * Segundo fator (TOTP) do /admin. Regra:
 * - admin com fator verificado sempre precisa da sessão aal2 (senha + código);
 * - com FALOW_ADMIN_REQUIRE_MFA=true, TODO admin precisa de aal2: quem ainda
 *   não tem fator só alcança /admin/mfa, para cadastrar.
 *
 * O padrão é desligado para o dono não ficar trancado fora antes de cadastrar
 * o fator. Ligue a variável só depois que todos os admins cadastrarem: até lá,
 * quem tiver só a senha de um admin sem fator consegue cadastrar o próprio.
 */

export const ADMIN_MFA_PATH = "/admin/mfa";

export function adminMfaRequiredByEnv(): boolean {
  return process.env.FALOW_ADMIN_REQUIRE_MFA?.trim().toLowerCase() === "true";
}

type AalResult = {
  data: { currentLevel: string | null; nextLevel: string | null } | null;
  error: unknown;
};

export type AalClient = {
  auth: { mfa: { getAuthenticatorAssuranceLevel: () => Promise<AalResult> } };
};

/**
 * A sessão precisa subir para aal2 antes de usar o /admin? Lê o nível do JWT
 * da sessão (sem ida à rede). Erro de leitura com a exigência ligada fecha.
 */
export async function adminNeedsMfa(supabase: AalClient): Promise<boolean> {
  const required = adminMfaRequiredByEnv();
  let result: AalResult;
  try {
    result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  } catch (err) {
    console.error("[admin] falha ao ler o nível de autenticação (AAL):", err);
    return required;
  }
  if (result.error || !result.data) return required;
  const { currentLevel, nextLevel } = result.data;
  if (currentLevel === "aal2") return false;
  return required || nextLevel === "aal2";
}
