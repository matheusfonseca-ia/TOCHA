import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { appUrl } from "@/lib/app-url";
import { encryptToken } from "@/lib/crypto";
import { hasActiveAccess, isAdmin } from "@/lib/billing/access";
import { connectBlockReason } from "@/lib/meta/connect-guard";
import { subscribeAccountToWebhooks } from "@/lib/meta/graph";
import {
  exchangeCodeForToken,
  getInstagramProfile,
  getLongLivedToken,
} from "@/lib/meta/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToAccounts(params: string) {
  return NextResponse.redirect(appUrl(`/accounts?${params}`));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Usuário negou a autorização no diálogo do Instagram
  if (searchParams.get("error")) {
    return redirectToAccounts("error=oauth_denied");
  }

  // Validação do state anti-CSRF
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = cookies();
  const expectedState = cookieStore.get("meta_oauth_state")?.value;
  cookieStore.delete("meta_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToAccounts("error=invalid_state");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(appUrl("/login"));
  }

  try {
    // Confere de novo: o cliente pode ter sido bloqueado durante a autorização.
    if (!(await hasActiveAccess(supabase, user.id))) {
      return NextResponse.redirect(appUrl("/assinatura"));
    }
    // code → token curto → token longo (~60 dias) → perfil da conta
    const { token: shortToken } = await exchangeCodeForToken(code);
    const { token: longToken, expiresIn } = await getLongLivedToken(shortToken);
    const profile = await getInstagramProfile(longToken);

    // O id entra num filtro .or(...): só dígitos (cai em exchange_failed no catch).
    if (!/^\d+$/.test(profile.igUserId)) {
      throw new Error("ig_user_id inesperado na resposta do Instagram");
    }

    const admin = createAdminClient();

    // O RLS só mostra as contas do próprio usuário; o @ de outro login só
    // aparece pela service role.
    const { data: activeAccounts, error: accountsError } = await admin
      .from("ig_accounts")
      .select("user_id, ig_user_id")
      .eq("status", "active")
      .or(`ig_user_id.eq.${profile.igUserId},user_id.eq.${user.id}`);
    if (accountsError) throw new Error(`ig_accounts: ${accountsError.message}`);
    const blocked = connectBlockReason({
      userId: user.id,
      igUserId: profile.igUserId,
      owner: isAdmin(user.id),
      activeAccounts: activeAccounts ?? [],
    });
    if (blocked) return redirectToAccounts(`error=${blocked}`);

    // Necessário para o Meta entregar eventos de mensagens desta conta
    try {
      await subscribeAccountToWebhooks(longToken);
    } catch (err) {
      console.warn(
        `[oauth] falha ao inscrever @${profile.username} no webhook:`,
        err instanceof Error ? err.message : err
      );
    }

    // Escrita pela service role: o user_id vem da sessão validada acima (a policy de ig_accounts é só leitura, migration 0022).
    const { error } = await admin.from("ig_accounts").upsert(
      {
        user_id: user.id,
        ig_user_id: profile.igUserId,
        ig_username: profile.username,
        page_id: null,
        page_name: null,
        profile_picture_url: profile.profilePictureUrl,
        access_token_enc: encryptToken(longToken),
        token_expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
        status: "active",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,ig_user_id" }
    );

    if (error) {
      console.error("[oauth] erro ao salvar conta:", error.message);
      // Corrida com outro login conectando o mesmo @ (índice único da 0020).
      if (error.code === "23505") return redirectToAccounts("error=account_taken");
      return redirectToAccounts("error=unknown");
    }

    return redirectToAccounts("connected=1");
  } catch (err) {
    console.error("[oauth] callback falhou:", err);
    return redirectToAccounts("error=exchange_failed");
  }
}
