/**
 * Texto do contador de não lidas. A pílula da sidebar aberta cabe até "99+";
 * a bolinha no canto do ícone (sidebar recolhida) só cabe dois caracteres,
 * então lá o teto é 9.
 */
export function formatUnreadCount(count: number, max: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  const whole = Math.floor(count);
  return whole > max ? `${max}+` : String(whole);
}

/** Texto para leitor de tela e tooltip, com o número inteiro e plural certo. */
export function unreadLabel(count: number): string {
  const whole = Math.max(0, Math.floor(count));
  return whole === 1 ? "1 não lida" : `${whole} não lidas`;
}
