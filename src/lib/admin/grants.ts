import { isAdmin, type QueryClient } from "@/lib/billing/access";
import type { AccessGrant, AdminAuditAction } from "@/types/database";

/**
 * Cortesia e bloqueio. Chamado SÓ depois de requireAdmin(), com o client da
 * service role. Toda escrita grava a auditoria; se a auditoria falhar, a
 * mudança é revertida. Se a reversão também falhar, informa o estado incerto.
 */

export type GrantResult = { ok: true } | { ok: false; error: string };

export const ADMIN_TARGET_ERROR = "Admins não podem ser alterados pelo painel.";
const MAX_FUTURE_MS = 5 * 366 * 86_400_000;

function badReason(reason: string): string | null {
  const r = reason.trim();
  return r.length >= 1 && r.length <= 200 ? null : "O motivo precisa ter de 1 a 200 caracteres.";
}

export async function recordAudit(
  admin: QueryClient,
  entry: { adminId: string; action: AdminAuditAction; targetUserId: string | null; details?: Record<string, unknown> }
): Promise<boolean> {
  try {
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: entry.adminId,
      action: entry.action,
      target_user_id: entry.targetUserId,
      details: entry.details ?? {},
    });
    if (error) console.error("[admin] falha ao gravar auditoria:", error.message);
    return !error;
  } catch (err) {
    console.error("[admin] falha ao gravar auditoria:", err);
    return false;
  }
}

async function currentGrant(admin: QueryClient, userId: string): Promise<{ grant: AccessGrant | null; error: string | null }> {
  const { data, error } = await admin.from("access_grants").select("*").eq("user_id", userId).maybeSingle();
  return { grant: (data as AccessGrant | null) ?? null, error: error ? error.message : null };
}

/** Volta access_grants do usuário ao estado anterior (linha antiga ou nenhuma). */
async function restore(admin: QueryClient, userId: string, previous: AccessGrant | null): Promise<boolean> {
  try {
    const { error } = previous
      ? await admin.from("access_grants").upsert(previous, { onConflict: "user_id" })
      : await admin.from("access_grants").delete().eq("user_id", userId);
    if (!error) return true;
    console.error(`[admin] falha ao reverter access_grants de ${userId}:`, error.message);
  } catch (err) {
    console.error(`[admin] falha ao reverter access_grants de ${userId}:`, err);
  }
  return false;
}

async function writeWithAudit(
  admin: QueryClient,
  targetUserId: string,
  change: () => Promise<{ error: { message: string } | null }>,
  audit: { adminId: string; action: AdminAuditAction; details?: Record<string, unknown> },
  guard?: (previous: AccessGrant | null) => string | null
): Promise<GrantResult> {
  if (isAdmin(targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };
  const { grant: previous, error: readError } = await currentGrant(admin, targetUserId);
  if (readError) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };

  const guardError = guard?.(previous);
  if (guardError) return { ok: false, error: guardError };

  const { error } = await change();
  if (error) return { ok: false, error: "Não foi possível salvar. Tente de novo." };

  const audited = await recordAudit(admin, { ...audit, targetUserId });
  if (!audited) {
    const restored = await restore(admin, targetUserId, previous);
    if (!restored) return { ok: false, error: "O registro da ação e a reversão falharam. A alteração pode continuar aplicada; confira o cliente antes de tentar novamente." };
    return { ok: false, error: "Não foi possível registrar a ação; nada foi alterado." };
  }
  return { ok: true };
}

export async function grantCourtesy(
  admin: QueryClient,
  /** `expiresAt` nulo = cortesia sem prazo (vale até um admin remover). */
  input: { adminId: string; targetUserId: string; expiresAt: Date | null; reason: string; now?: Date }
): Promise<GrantResult> {
  const now = input.now ?? new Date();
  if (input.expiresAt) {
    const expires = input.expiresAt.getTime();
    if (Number.isNaN(expires) || expires <= now.getTime() || expires > now.getTime() + MAX_FUTURE_MS) {
      return { ok: false, error: "A validade precisa ser uma data futura de até 5 anos." };
    }
  }
  const expiresAtIso = input.expiresAt ? input.expiresAt.toISOString() : null;
  const reasonError = badReason(input.reason);
  if (reasonError) return { ok: false, error: reasonError };
  if (isAdmin(input.targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };

  return writeWithAudit(
    admin,
    input.targetUserId,
    () =>
      admin.from("access_grants").upsert(
        {
          user_id: input.targetUserId,
          kind: "courtesy",
          expires_at: expiresAtIso,
          reason: input.reason.trim(),
          granted_by: input.adminId,
        },
        { onConflict: "user_id" }
      ),
    { adminId: input.adminId, action: "courtesy_grant", details: { expires_at: expiresAtIso, reason: input.reason.trim() } },
    (previous) => (previous?.kind === "block" ? "Cliente bloqueado: desbloqueie antes de dar cortesia." : null)
  );
}

export async function revokeCourtesy(admin: QueryClient, input: { adminId: string; targetUserId: string }): Promise<GrantResult> {
  const { grant, error } = await currentGrant(admin, input.targetUserId);
  if (error) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };
  if (grant?.kind !== "courtesy") return { ok: false, error: "Este cliente não tem cortesia." };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () => admin.from("access_grants").delete().eq("user_id", input.targetUserId).eq("kind", "courtesy"),
    { adminId: input.adminId, action: "courtesy_revoke" }
  );
}

export async function blockUser(admin: QueryClient, input: { adminId: string; targetUserId: string; reason: string }): Promise<GrantResult> {
  if (isAdmin(input.targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };
  const reasonError = badReason(input.reason);
  if (reasonError) return { ok: false, error: reasonError };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () =>
      admin.from("access_grants").upsert(
        { user_id: input.targetUserId, kind: "block", expires_at: null, reason: input.reason.trim(), granted_by: input.adminId },
        { onConflict: "user_id" }
      ),
    { adminId: input.adminId, action: "block", details: { reason: input.reason.trim() } }
  );
}

export async function unblockUser(admin: QueryClient, input: { adminId: string; targetUserId: string }): Promise<GrantResult> {
  const { grant, error } = await currentGrant(admin, input.targetUserId);
  if (error) return { ok: false, error: "Não foi possível ler o cliente. Tente de novo." };
  if (grant?.kind !== "block") return { ok: false, error: "Este cliente não está bloqueado." };
  return writeWithAudit(
    admin,
    input.targetUserId,
    () => admin.from("access_grants").delete().eq("user_id", input.targetUserId).eq("kind", "block"),
    { adminId: input.adminId, action: "unblock" }
  );
}
