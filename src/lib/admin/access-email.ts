import { ADMIN_TARGET_ERROR, recordAudit, type GrantResult } from "@/lib/admin/grants";
import { isAdmin } from "@/lib/billing/access";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * "Reenviar acesso" do painel /admin. Chamado SÓ depois de requireAdmin().
 * Contas ainda não confirmadas recebem o convite (template "Invite user");
 * contas confirmadas recebem recuperação, mesmo sem login anterior.
 */
export async function resendAccessEmail(
  admin: AdminClient,
  input: { adminId: string; targetUserId: string }
): Promise<GrantResult> {
  if (isAdmin(input.targetUserId)) return { ok: false, error: ADMIN_TARGET_ERROR };

  const { data, error } = await admin.auth.admin.getUserById(input.targetUserId);
  const user = data?.user;
  if (error || !user) return { ok: false, error: "Cliente não encontrado." };
  if (!user.email) return { ok: false, error: "Este cliente não tem e-mail cadastrado." };

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`;
  const mode: "invite" | "recovery" = user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at ? "recovery" : "invite";
  const sent =
    mode === "invite"
      ? await admin.auth.admin.inviteUserByEmail(user.email, { redirectTo })
      : await admin.auth.resetPasswordForEmail(user.email, { redirectTo });
  if (sent.error) {
    console.error(`[admin] falha ao reenviar acesso (${mode}):`, sent.error.message);
    return { ok: false, error: "Não foi possível enviar o e-mail. Tente de novo." };
  }

  // Não há o que reverter (o e-mail já saiu): só avisa que o registro falhou.
  const audited = await recordAudit(admin, {
    adminId: input.adminId,
    action: "invite_resend",
    targetUserId: input.targetUserId,
    details: { mode },
  });
  if (!audited) {
    console.error(`[admin] e-mail de acesso (${mode}) enviado para ${input.targetUserId} sem registro na auditoria.`);
    return { ok: false, error: "O e-mail foi enviado, mas o registro da ação falhou." };
  }
  return { ok: true };
}
