"use server";

import { activeUserId } from "@/lib/auth/require-access";
import { getFreshToken } from "@/lib/meta/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { refreshLeadProfile } from "../server/refresh-profile";

// A URL da foto expira, mas a Meta não garante uma nova a cada chamada:
// no máximo 1 nova busca por hora e por lead.
const STALE_MS = 60 * 60 * 1000;
/** Fotos por chamada (a lista do Inbox tem 60) e buscas à Graph API em paralelo. */
const MAX_IDS = 60;
const CONCURRENCY = 5;

type StaleConversation = { account_id: string; ig_sender_id: string; ig_profile_fetched_at: string | null };

/**
 * Chamada quando fotos de leads falham ao carregar no painel (a URL da CDN
 * expirou; costumam expirar todas juntas). O cliente agrupa as falhas de
 * uma tela numa chamada só (`photo-refresh-queue.ts`). Confere a posse pelo
 * client do usuário (RLS), só busca de novo quem já passou de 1h desde a
 * última tentativa e usa um token por conta, não um por foto.
 */
export async function refreshLeadPhotos(conversationIds: string[]): Promise<void> {
  if (!Array.isArray(conversationIds)) return;
  const ids = Array.from(new Set(conversationIds.filter((id) => typeof id === "string" && id.length <= 64))).slice(0, MAX_IDS);
  if (ids.length === 0) return;
  if (!(await activeUserId())) return;

  const supabase = await createClient();

  const { data } = await supabase
    .from("conversations")
    .select("account_id, ig_sender_id, ig_profile_fetched_at")
    .in("id", ids);
  const now = Date.now();
  const stale = ((data ?? []) as StaleConversation[]).filter(
    (c) => now - (c.ig_profile_fetched_at ? Date.parse(c.ig_profile_fetched_at) : 0) >= STALE_MS
  );
  if (stale.length === 0) return;

  const admin = createAdminClient();
  const byAccount = new Map<string, StaleConversation[]>();
  for (const c of stale) byAccount.set(c.account_id, [...(byAccount.get(c.account_id) ?? []), c]);

  for (const [accountId, leads] of byAccount) {
    const { data: account } = await admin.from("ig_accounts").select("*").eq("id", accountId).maybeSingle<IgAccount>();
    if (!account) continue;
    let token: string;
    try {
      token = await getFreshToken(admin, account);
    } catch {
      continue; // conta desconectada: as iniciais continuam no lugar da foto
    }
    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      await Promise.all(
        leads.slice(i, i + CONCURRENCY).map((lead) => refreshLeadProfile(admin, account, lead.ig_sender_id, token))
      );
    }
  }
}

/** Uma foto só (mesmas regras de `refreshLeadPhotos`). */
export async function refreshLeadPhoto(conversationId: string): Promise<void> {
  await refreshLeadPhotos([conversationId]);
}
