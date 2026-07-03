import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Instalação single-tenant: assim que a primeira conta é criada, o
 * cadastro se tranca sozinho — não existe variável de ambiente pra isso,
 * nem passo manual. Falha na verificação bloqueia o cadastro (falha segura).
 */
export async function isSignupOpen(): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });

  if (error) return false;
  return data.users.length === 0;
}
