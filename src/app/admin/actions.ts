"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resendAccessEmail } from "@/lib/admin/access-email";
import { ADMIN_TARGET_ERROR, blockUser, grantCourtesy, revokeCourtesy, unblockUser, type GrantResult } from "@/lib/admin/grants";
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

// Validade vazia = cortesia sem prazo (período indeterminado).
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), date.nullable());
const optionalFutureDate = z.preprocess((v) => (v === "" || v == null ? null : v), futureDate.nullable());

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
    const parsed = z.object({ userId: uuid, expiresAt: optionalDate, reason }).safeParse(Object.fromEntries(formData));
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
      .object({ email: z.string().trim().toLowerCase().email("E-mail inválido."), expiresAt: optionalFutureDate, reason })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    const { email, expiresAt } = parsed.data;
    const admin = createAdminClient();

    // Reaproveita a conta se o e-mail já existe; senão convida (mesmo e-mail da compra).
    let targetUserId: string;
    let invited = false;
    let auditId: number | undefined;
    try {
      const existing = await findUserIdByEmail(admin, email);
      if (existing && isAdmin(existing)) return { ok: false, error: ADMIN_TARGET_ERROR };
      // Registra a intenção ANTES de criar a conta/enviar o e-mail. Mesmo se o
      // Auth ou a cortesia falhar, o pedido e o e-mail ficam rastreáveis.
      const { data: audit, error: auditError } = await admin.from("admin_audit_log").insert({
        admin_id: adminId,
        action: "courtesy_invite",
        target_user_id: existing,
        details: { email, status: "requested" },
      }).select("id").single();
      if (auditError || !audit) return { ok: false, error: "Não foi possível registrar o convite; nenhuma conta foi criada." };
      auditId = audit.id;
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

    // Completa o registro antes da cortesia, que pode ser recusada ou falhar.
    const { error: auditError } = await admin.from("admin_audit_log").update({
      target_user_id: targetUserId,
      details: { email, invited, status: invited ? "created" : "existing" },
    }).eq("id", auditId!);
    if (auditError) {
      console.error("[admin] falha ao completar auditoria do convite:", auditError.message);
      return { ok: false, error: invited
        ? "Conta criada e convite enviado, mas a conclusão do registro falhou. O pedido está registrado e a cortesia não foi aplicada."
        : "O pedido foi registrado, mas não foi possível completar o registro. A cortesia não foi aplicada." };
    }

    const granted = await grantCourtesy(admin, { adminId, targetUserId, expiresAt, reason: parsed.data.reason });
    if (!granted.ok) return invited ? { ok: false, error: `Convite enviado, mas a cortesia falhou: ${granted.error}` } : granted;

    return { ok: true };
  });
}
