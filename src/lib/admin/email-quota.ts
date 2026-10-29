import type { QueryClient } from "@/lib/billing/access";

/**
 * Teto de e-mails disparados por admin (convite com cortesia + reenvio de
 * acesso) por hora, contado no próprio admin_audit_log. Sessão de admin
 * roubada não vira disparo em massa em nome do Falow.
 */
export const ADMIN_EMAILS_PER_HOUR = 20;
export const ADMIN_EMAIL_QUOTA_ERROR =
  `Limite de ${ADMIN_EMAILS_PER_HOUR} convites/reenvios por hora atingido. Tente de novo mais tarde.`;

type AuditRow = { action: string; details: Record<string, unknown> | null };

/** true = pode enviar. Falha de leitura bloqueia (com log): melhor recusar do que liberar sem conta. */
export async function withinEmailQuota(admin: QueryClient, adminId: string, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("action, details")
    .eq("admin_id", adminId)
    .in("action", ["courtesy_invite", "invite_resend"])
    .gte("created_at", since)
    .limit(ADMIN_EMAILS_PER_HOUR * 3);
  if (error) {
    console.error("[admin] falha ao conferir o limite de e-mails:", error.message);
    return false;
  }
  // Cada convite grava duas linhas (pedido + conclusão): conta só o pedido.
  const sent = ((data ?? []) as AuditRow[]).filter(
    (row) => row.action === "invite_resend" || row.details?.status === "requested"
  ).length;
  if (sent >= ADMIN_EMAILS_PER_HOUR) {
    console.error(`[admin] admin ${adminId} atingiu o limite de ${ADMIN_EMAILS_PER_HOUR} e-mails por hora.`);
    return false;
  }
  return true;
}
