/**
 * Automações e workflows temporários: funções puras (sem banco nem React),
 * compartilhadas pelo sweep, pelo matching do webhook, pelas server actions
 * e pela UI.
 */

export const EXPIRE_ACTIONS = ["delete", "pause"] as const;
export type ExpireAction = (typeof EXPIRE_ACTIONS)[number];

export const EXPIRY_PRESETS = ["24h", "3d", "7d"] as const;
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const PRESET_MS: Record<ExpiryPreset, number> = {
  "24h": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
};

/** Antecedência mínima ao escolher a data (evita salvar algo que já nasce vencido). */
export const MIN_EXPIRY_LEAD_MS = 5 * MINUTE_MS;
/** Abaixo disso a lista destaca a expiração com cor de aviso. */
export const EXPIRY_SOON_MS = DAY_MS;

type DateLike = Date | string | number;

function toMs(value: DateLike): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** ISO de "agora + preset". */
export function expiryPreset(preset: ExpiryPreset, now: DateLike = new Date()): string {
  return new Date(toMs(now) + PRESET_MS[preset]).toISOString();
}

export function isExpired(
  expiresAt: string | null | undefined,
  now: DateLike = new Date()
): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= toMs(now);
}

/**
 * Filtro em memória do matching do webhook. Fica fora da query de propósito:
 * linha sem a coluna (migration 0003 ainda não aplicada) conta como
 * permanente, então o webhook segue funcionando antes da migration.
 */
export function withoutExpired<T extends { expires_at?: string | null }>(
  rows: readonly T[],
  now: DateLike = new Date()
): T[] {
  const nowMs = toMs(now);
  return rows.filter((r) => !isExpired(r.expires_at, nowMs));
}

export type ExpiryTone = "normal" | "soon" | "expired";

export function expiryTone(
  expiresAt: string | null | undefined,
  now: DateLike = new Date()
): ExpiryTone | null {
  if (!expiresAt) return null;
  const diff = Date.parse(expiresAt) - toMs(now);
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return "expired";
  return diff < EXPIRY_SOON_MS ? "soon" : "normal";
}

/** "Expira em 2 dias", "Expira em 3 h", "Expira em 12 min", "Expirada". Nulo = permanente. */
export function expiryLabel(
  expiresAt: string | null | undefined,
  now: DateLike = new Date()
): string | null {
  if (!expiresAt) return null;
  const diff = Date.parse(expiresAt) - toMs(now);
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return "Expirada";
  if (diff < HOUR_MS) return `Expira em ${Math.max(1, Math.ceil(diff / MINUTE_MS))} min`;
  if (diff < DAY_MS) return `Expira em ${Math.max(1, Math.round(diff / HOUR_MS))} h`;
  const days = Math.max(1, Math.round(diff / DAY_MS));
  return `Expira em ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Erro amigável ou null. `null`/vazio = permanente, sempre válido. */
export function validateExpiry(
  expiresAt: string | null | undefined,
  now: DateLike = new Date()
): string | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return "Data de expiração inválida.";
  if (at - toMs(now) < MIN_EXPIRY_LEAD_MS) {
    return "A expiração precisa ser pelo menos 5 minutos no futuro.";
  }
  return null;
}

// ── Estado do formulário (ExpiryField) ─────────────────────────────────────

export type ExpiryMode = ExpiryPreset | "custom";

export interface ExpiryFormValue {
  enabled: boolean;
  mode: ExpiryMode;
  /** Valor cru do `<input type="datetime-local">` (hora local, sem fuso). */
  customLocal: string;
  action: ExpireAction;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → "YYYY-MM-DDTHH:mm" no fuso do navegador. */
export function toDatetimeLocal(value: DateLike): string {
  const d = new Date(toMs(value));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (hora local) → ISO, ou null se inválido. */
export function fromDatetimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Estado inicial do campo a partir do que está salvo. */
export function expiryFormFrom(
  expiresAt: string | null | undefined,
  action: ExpireAction | null | undefined
): ExpiryFormValue {
  return {
    enabled: !!expiresAt,
    mode: expiresAt ? "custom" : "24h",
    customLocal: expiresAt ? toDatetimeLocal(expiresAt) : "",
    action: action ?? "delete",
  };
}

/**
 * Converte o estado do formulário no que vai para o banco. Presets contam a
 * partir de `now` (o momento do salvar), não de quando o preset foi clicado.
 */
export function resolveExpiryForm(
  value: ExpiryFormValue,
  now: DateLike = new Date()
): { expires_at: string | null; expire_action: ExpireAction; error?: string } {
  if (!value.enabled) return { expires_at: null, expire_action: value.action };
  const expires_at =
    value.mode === "custom" ? fromDatetimeLocal(value.customLocal) : expiryPreset(value.mode, now);
  if (!expires_at) {
    return { expires_at: null, expire_action: value.action, error: "Escolha a data e a hora da expiração." };
  }
  const error = validateExpiry(expires_at, now) ?? undefined;
  return { expires_at, expire_action: value.action, ...(error && { error }) };
}
