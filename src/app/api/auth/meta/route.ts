import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { appUrl } from "@/lib/app-url";
import { hasActiveAccess } from "@/lib/billing/access";
import { getOAuthDialogUrl } from "@/lib/meta/oauth";
import { createClient } from "@/lib/supabase/server";

/** Inicia o fluxo OAuth: gera state anti-CSRF e redireciona ao diálogo do Facebook. */
export async function GET() {
  const supabase = createClient();
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
  cookies().set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getOAuthDialogUrl(state));
}
