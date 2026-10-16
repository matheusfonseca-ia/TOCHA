import { isAdmin } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

export class AdminRequiredError extends Error {
  constructor() {
    super("Acesso restrito a administradores.");
  }
}

/**
 * Primeira linha de TODA server action e página de /admin. Valida a sessão no
 * servidor (getUser revalida o JWT) e confere a lista de admins dos secrets.
 */
export async function requireAdmin(): Promise<{ adminId: string }> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user || !isAdmin(user.id)) throw new AdminRequiredError();
  return { adminId: user.id };
}
