import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { encryptToken } from "@/lib/crypto";
import { subscribePageToWebhooks } from "@/lib/meta/graph";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getPagesWithInstagram,
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

  // Usuário negou a autorização no diálogo do Facebook
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
    // code → token curto → token longo (~60 dias) → páginas com IG Business
    const shortToken = await exchangeCodeForToken(code);
    const { token: longToken } = await getLongLivedToken(shortToken);
    const pages = await getPagesWithInstagram(longToken);

    if (pages.length === 0) {
      return redirectToAccounts("error=no_ig_account");
    }

    let connected = 0;

    for (const page of pages) {
      const ig = page.instagram_business_account!;

      // Necessário para o Meta entregar eventos de mensagens desta página
      try {
        await subscribePageToWebhooks(page.id, page.access_token);
      } catch (err) {
        console.warn(
          `[oauth] falha ao inscrever página ${page.id} no webhook:`,
          err instanceof Error ? err.message : err
        );
      }

      // RLS (with check user_id = auth.uid()) garante a posse da linha
      const { error } = await supabase.from("ig_accounts").upsert(
        {
          user_id: user.id,
          ig_user_id: ig.id,
          ig_username: ig.username,
          page_id: page.id,
          page_name: page.name,
          profile_picture_url: ig.profile_picture_url ?? null,
          access_token_enc: encryptToken(page.access_token),
          token_expires_at: null,
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ig_user_id" }
      );

      if (error) {
        console.error("[oauth] erro ao salvar conta:", error.message);
      } else {
        connected++;
      }
    }

    if (connected === 0) {
      return redirectToAccounts("error=unknown");
    }

    return redirectToAccounts(`connected=${connected}`);
  } catch (err) {
    console.error("[oauth] callback falhou:", err);
    return redirectToAccounts("error=exchange_failed");
  }
}
