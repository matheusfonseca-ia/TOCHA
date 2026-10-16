"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resendAccessEmail } from "@/lib/admin/access-email";
import { ADMIN_TARGET_ERROR, blockUser, grantCourtesy, recordAudit, revokeCourtesy, unblockUser, type GrantResult } from "@/lib/admin/grants";
import { AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";
import { findUserIdByEmail, inviteUser } from "@/lib/auth/invite";
import { isAdmin } from "@/lib/billing/access";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ações do painel /admin. TODA action começa com requireAdmin() — a trava de
 * auditoria (admin-actions.audit.test.ts) falha se uma delas não começar.
 */

const uuid = z.string().uuid("Cliente inválido.");
const reason = z.string().trim().min(1, "Informe o motivo.").max(200, "Motivo de até 200 caracteres.");
const date = z.coerce.date({ errorMap: () => ({ message: "Data inválida." }) });
// O convite cria a conta antes da cortesia: confere a validade antes, para não
// convidar alguém e depois recusar a cortesia (grantCourtesy confere de novo).
const MAX_FUTURE_MS = 5 * 366 * 86_400_000;
const futureDate = date.refine(
  (d) => d.getTime() > Date.now() && d.getTime() <= Date.now() + MAX_FUTURE_MS,
  "A validade precisa ser uma data futura de até 5 anos."
);

async function guarded(run: (adminId: string) => Promise<GrantResult>): Promise<GrantResult> {
  let adminId: string;
  try {
    ({ adminId } = await requireAdmin());
  } catch (err) {
    if (err instanceof AdminRequiredError) return { ok: false, error: err.message };
    throw err;
  }
  const result = await run(adminId);
  if (result.ok) revalidatePath("/admin", "layout");
  return result;
}

export async function grantCourtesyAction(formData: FormData): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = z.object({ userId: uuid, expiresAt: date, reason }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return grantCourtesy(createAdminClient(), { adminId, targetUserId: parsed.data.userId, expiresAt: parsed.data.expiresAt, reason: parsed.data.reason });
  });
}

export async function revokeCourtesyAction(userId: string): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = uuid.safeParse(userId);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return revokeCourtesy(createAdminClient(), { adminId, targetUserId: parsed.data });
  });
}

export async function blockUserAction(formData: FormData): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = z.object({ userId: uuid, reason }).safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return blockUser(createAdminClient(), { adminId, targetUserId: parsed.data.userId, reason: parsed.data.reason });
  });
}

export async function unblockUserAction(userId: string): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = uuid.safeParse(userId);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return unblockUser(createAdminClient(), { adminId, targetUserId: parsed.data });
  });
}

export async function resendAccessAction(userId: string): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = uuid.safeParse(userId);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    return resendAccessEmail(createAdminClient(), { adminId, targetUserId: parsed.data });
  });
}

export async function inviteWithCourtesyAction(formData: FormData): Promise<GrantResult> {
  return guarded(async (adminId) => {
    const parsed = z
      .object({ email: z.string().trim().toLowerCase().email("E-mail inválido."), expiresAt: futureDate, reason })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    const { email, expiresAt } = parsed.data;
    const admin = createAdminClient();

    // Reaproveita a conta se o e-mail já existe; senão convida (mesmo e-mail da compra).
    let targetUserId: string;
    let invited = false;
    try {
      const existing = await findUserIdByEmail(admin, email);
      if (existing && isAdmin(existing)) return { ok: false, error: ADMIN_TARGET_ERROR };
      if (existing) {
        targetUserId = existing;
      } else {
        targetUserId = await inviteUser(admin, email);
        invited = true;
      }
    } catch (err) {
      console.error("[admin] convite com cortesia falhou:", err instanceof Error ? err.message : err);
      return { ok: false, error: "Não foi possível convidar este e-mail. Tente de novo." };
    }

    const granted = await grantCourtesy(admin, { adminId, targetUserId, expiresAt, reason: parsed.data.reason });
    if (!granted.ok) return invited ? { ok: false, error: `Convite enviado, mas a cortesia falhou: ${granted.error}` } : granted;

    // A cortesia já tem o próprio registro (courtesy_grant); este marca o convite.
    const audited = await recordAudit(admin, { adminId, action: "courtesy_invite", targetUserId, details: { email, invited } });
    if (!audited) return { ok: false, error: "Cortesia gravada, mas o registro do convite falhou." };
    return { ok: true };
  });
}
