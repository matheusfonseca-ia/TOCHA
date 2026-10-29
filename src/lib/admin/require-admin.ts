import { notFound, redirect } from "next/navigation";
import * as React from "react";

import { ADMIN_MFA_PATH, adminNeedsMfa, type AalClient } from "@/lib/admin/mfa";
import { isAdmin } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

export class AdminRequiredError extends Error {
  constructor(message = "Acesso restrito a administradores.") {
    super(message);
  }
}

/** Admin de verdade, mas a sessão ainda não confirmou o segundo fator (aal2). */
export class AdminMfaRequiredError extends AdminRequiredError {
  constructor() {
    super("Confirme o código do aplicativo autenticador em /admin/mfa para usar o admin.");
  }
}

type AdminSession = { userId: string | null; needsMfa: boolean };

async function loadAdminSession(): Promise<AdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.id)) return { userId: null, needsMfa: false };
  return { userId: user.id, needsMfa: await adminNeedsMfa(supabase as unknown as AalClient) };
}

/**
 * Uma ida ao Auth por render: layout e página do /admin chamam requireAdmin()
 * em paralelo. `cache` do React só existe no runtime do Next (fora dele, ex.:
 * testes, cada chamada lê de novo); server actions rodam em requisição própria.
 */
const reactCache = (React as unknown as { cache?: <T extends (...args: never[]) => unknown>(fn: T) => T }).cache;
const adminSession = typeof reactCache === "function" ? reactCache(loadAdminSession) : loadAdminSession;

/**
 * Primeira linha de TODA server action e página de /admin. Valida a sessão no
 * servidor (getUser revalida o JWT), confere a lista de admins dos secrets e
 * o segundo fator (lib/admin/mfa.ts). `allowAal1` só para a tela de cadastro
 * e confirmação do código (/admin/mfa).
 */
export async function requireAdmin(opts: { allowAal1?: boolean } = {}): Promise<{ adminId: string }> {
  const { userId, needsMfa } = await adminSession();
  if (!userId) throw new AdminRequiredError();
  if (needsMfa && !opts.allowAal1) throw new AdminMfaRequiredError();
  return { adminId: userId };
}

/** Para páginas do /admin: sem admin vira 404; sem o segundo fator, vai para /admin/mfa. */
export async function requireAdminPage(): Promise<{ adminId: string }> {
  try {
    return await requireAdmin();
  } catch (err) {
    if (err instanceof AdminMfaRequiredError) redirect(ADMIN_MFA_PATH);
    if (err instanceof AdminRequiredError) notFound();
    throw err;
  }
}
