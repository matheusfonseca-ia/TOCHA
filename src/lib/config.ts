/**
 * Instalação single-tenant: depois que o dono cria a própria conta,
 * ele define SIGNUP_ENABLED=false para impedir novos cadastros no painel.
 * Qualquer valor diferente de "false" mantém o cadastro aberto.
 */
export function isSignupEnabled(): boolean {
  return process.env.SIGNUP_ENABLED !== "false";
}
