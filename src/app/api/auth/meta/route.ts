import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { hasActiveAccess } from "@/lib/billing/access";
import { getOAuthDialogUrl, META_OAUTH_COOKIE, META_OAUTH_COOKIE_PATH } from "@/lib/meta/oauth";
import { createClient } from "@/lib/supabase/server";

/**
 * Inicia o fluxo OAuth: gera state anti-CSRF e redireciona ao diálogo do
 * Instagram. O cookie guarda `state:user_id`: o callback só aceita se quem
 * estiver logado for o mesmo usuário que clicou em "Conectar".
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(appUrl("/login"));
  }

  if (!(await hasActiveAccess(supabase, user.id))) {
    return NextResponse.redirect(appUrl("/assinatura"));
  }

  const state = randomUUID();
  (await cookies()).set(META_OAUTH_COOKIE, `${state}:${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: META_OAUTH_COOKIE_PATH,
  });

  return NextResponse.redirect(getOAuthDialogUrl(state));
}
