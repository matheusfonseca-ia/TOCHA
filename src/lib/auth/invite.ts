import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Usuário do Auth pelo e-mail (RPC só do service_role, migration 0020). */
export async function findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc("falow_user_id_by_email", { p_email: email });
  if (error) throw new Error(`falow_user_id_by_email: ${error.message}`);
  return (data as string | null) ?? null;
}

/** Cria a conta e manda o e-mail de definir senha (template "Invite user"). */
export async function inviteUser(admin: AdminClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/definir-senha`,
  });
  if (error || !data.user) throw new Error(`convite falhou: ${error?.message ?? "sem usuário"}`);
  return data.user.id;
}
