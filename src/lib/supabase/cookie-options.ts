/**
 * Opções do cookie da sessão (`sb-<ref>-auth-token`), iguais nos três clients
 * (server, middleware e navegador): se divergirem, cada lado grava um cookie
 * diferente com o mesmo nome.
 *
 * `secure` em produção: o cookie nunca sai numa requisição http://. Em dev
 * (http://localhost) fica de fora para o login local continuar funcionando.
 *
 * O `path` continua "/" (padrão do @supabase/ssr) de propósito: trocar para
 * "/sistema" deixaria o cookie antigo de path "/" vivo no navegador de quem
 * já está logado. O navegador mandaria os dois com o mesmo nome, o Next fica
 * com o último (o antigo, nunca mais renovado) e a sessão cairia em laço até
 * o cookie velho expirar. Mudar o path exige uma migração que apague o
 * cookie antigo primeiro.
 */
export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
