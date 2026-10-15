// Fuso fixo: o Worker da Cloudflare roda em UTC, e formatar no fuso do servidor mostra o dia seguinte
// para quem cancelou à noite em Brasília.
const purgeDateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Dia (fuso de São Paulo) a partir do qual os dados do cliente podem ser apagados. O cron de purge roda
 * às 03h de Brasília e apaga quem já passou do `purge_after`: a conta nunca some antes desse dia, mas
 * pode sumir nele. Por isso a tela diz "apagados a partir de", nunca "guardados até".
 */
export function formatPurgeDate(iso: string): string {
  return purgeDateFormat.format(new Date(iso));
}
