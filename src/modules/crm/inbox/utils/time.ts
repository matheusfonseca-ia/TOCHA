/**
 * Horários do Inbox sempre no fuso de Brasília: o servidor (Worker) roda em
 * UTC e o navegador no fuso do usuário, e formatar em fusos diferentes quebra
 * a hidratação do React. Fuso fixo = mesmo texto nos dois lados.
 */
const TZ = "America/Sao_Paulo";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" });
const shortDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" });
const longDayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });

const DAY_MS = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd no fuso de Brasília. */
export function dayKey(iso: string | number): string {
  return dayKeyFmt.format(new Date(iso));
}

function daysBetween(iso: string, now: number): number {
  return Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(iso))) / DAY_MS);
}

/** Lista de conversas: "14:32", "Ontem", "seg.", "12/09/26". */
export function listTime(iso: string, now = Date.now()): string {
  const diff = daysBetween(iso, now);
  if (diff <= 0) return hourFmt.format(new Date(iso));
  if (diff === 1) return "Ontem";
  if (diff < 7) return weekdayFmt.format(new Date(iso));
  return shortDateFmt.format(new Date(iso));
}

/** Separador de dia na conversa: "Hoje", "Ontem", "segunda-feira, 22 de setembro". */
export function dayLabel(iso: string, now = Date.now()): string {
  const diff = daysBetween(iso, now);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return longDayFmt.format(new Date(iso));
}

export function messageTime(iso: string): string {
  return hourFmt.format(new Date(iso));
}

export function fullDateTime(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/** Janela de 24h da Meta, contada da última mensagem do lead. */
export function windowStatus(
  lastInboundAt: string | null,
  now = Date.now()
): { open: boolean; label: string } {
  if (!lastInboundAt) return { open: false, label: "Janela fechada: aguarde o lead escrever" };
  const left = Date.parse(lastInboundAt) + DAY_MS - now;
  if (left <= 0) return { open: false, label: "Janela fechada: aguarde o lead escrever" };
  const hours = Math.floor(left / (60 * 60 * 1000));
  const label = hours >= 1 ? `Janela aberta, fecha em ${hours}h` : "Janela aberta, fecha em menos de 1h";
  return { open: true, label };
}
