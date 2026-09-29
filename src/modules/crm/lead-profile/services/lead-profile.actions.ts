"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IgAccount } from "@/types/database";

import { refreshLeadProfile } from "../server/refresh-profile";

// A URL da foto expira, mas a Meta não garante uma nova a cada chamada:
// no máximo 1 nova busca por hora e por lead.
const STALE_MS = 60 * 60 * 1000;

/**
 * Chamada pelo `onError` da foto do lead no painel (a URL da CDN expirou).
 * Confere a posse pelo client do usuário (RLS) e só busca de novo se a
 * última busca já passou de 1h, senão a cada render da lista dispararia
 * uma chamada nova à Graph API.
 */
export async function refreshLeadPhoto(conversationId: string): Promise<void> {
  const supabase = createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("account_id, ig_sender_id, ig_profile_fetched_at")
    .eq("id", conversationId)
    .maybeSingle<{
      account_id: string;
      ig_sender_id: string;
      ig_profile_fetched_at: string | null;
    }>();
  if (!conversation) return;

  const fetchedAt = conversation.ig_profile_fetched_at
    ? Date.parse(conversation.ig_profile_fetched_at)
    : 0;
  if (Date.now() - fetchedAt < STALE_MS) return;

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("ig_accounts")
    .select("*")
    .eq("id", conversation.account_id)
    .maybeSingle<IgAccount>();
  if (!account) return;

  await refreshLeadProfile(admin, account, conversation.ig_sender_id);
}
