/**
 * Nó "Pausar automações": enquanto `conversations.automation_paused_until`
 * estiver no futuro, a pessoa não entra em novas regras nem workflows — só
 * runs já em andamento continuam normalmente (ver `process.ts`). Puro:
 * conversão de horas para timestamp e checagem de vigência.
 */

export function pauseUntilFromHours(hours: number, now = Date.now()): string {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

/** true quando `pausedUntil` existe e ainda está no futuro. */
export function isPausedAt(
  pausedUntil: string | null | undefined,
  now = Date.now()
): boolean {
  if (!pausedUntil) return false;
  const ts = Date.parse(pausedUntil);
  return Number.isFinite(ts) && ts > now;
}
