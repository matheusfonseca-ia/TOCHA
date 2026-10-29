import { hasActiveAccess } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Sessão sem acesso ativo (bloqueio, cortesia vencida ou assinatura sem
 * acesso). O middleware não cobre server actions disparadas a partir de
 * rotas públicas, então toda action do painel confere de novo aqui.
 */
export class AccessRequiredError extends Error {
  constructor() {
    super("Sua assinatura não está ativa. Acesse Minha assinatura para reativar.");
    this.name = "AccessRequiredError";
  }
}

/** Usuário logado com acesso ativo, ou null. Para actions que devolvem `{ error }`. */
export async function activeUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return (await hasActiveAccess(supabase, user.id)) ? user.id : null;
}

/** Igual a `activeUserId`, mas lança: para actions que já tratam exceção. */
export async function requireActiveUser(): Promise<{ userId: string }> {
  const userId = await activeUserId();
  if (!userId) throw new AccessRequiredError();
  return { userId };
}
