import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { encryptToken } from "@/lib/crypto";
import { subscribeAccountToWebhooks } from "@/lib/meta/graph";
import {
  exchangeCodeForToken,
  getInstagramProfile,
  getLongLivedToken,
} from "@/lib/meta/oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectToAccounts(params: string) {
  return NextResponse.redirect(
    new URL(`/accounts?${params}`, process.env.NEXT_PUBLIC_APP_URL)
  );
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
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL)
    );
  }

  try {
    // code → token curto → token longo (~60 dias) → perfil da conta
    const { token: shortToken } = await exchangeCodeForToken(code);
    const { token: longToken, expiresIn } = await getLongLivedToken(shortToken);
    const profile = await getInstagramProfile(longToken);

    // Necessário para o Meta entregar eventos de mensagens desta conta
    try {
      await subscribeAccountToWebhooks(longToken);
    } catch (err) {
      console.warn(
        `[oauth] falha ao inscrever @${profile.username} no webhook:`,
        err instanceof Error ? err.message : err
      );
    }

    // RLS (with check user_id = auth.uid()) garante a posse da linha
    const { error } = await supabase.from("ig_accounts").upsert(
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
      return redirectToAccounts("error=unknown");
    }

    return redirectToAccounts("connected=1");
  } catch (err) {
    console.error("[oauth] callback falhou:", err);
    return redirectToAccounts("error=exchange_failed");
  }
}
