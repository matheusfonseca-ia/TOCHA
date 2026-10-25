import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { PUBLIC_PATHS, isAdminPath, routeFor } from "@/lib/auth/routing";
import { hasActiveAccess, isAdmin } from "@/lib/billing/access";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas de API cuidam da própria autenticação (webhook usa assinatura HMAC).
  if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Importante: getUser() revalida o JWT e renova a sessão via cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Regra única (admin → bloqueio → cortesia → assinatura); o client do usuário
  // lê só as próprias linhas de access_grants e subscriptions (RLS).
  const hasAccess = user ? await hasActiveAccess(supabase, user.id) : false;

  // /admin não existe para quem não é admin: 404, sem revelar a área.
  if (user && isAdminPath(pathname) && !isAdmin(user.id)) {
    const url = request.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  const target = routeFor(pathname, { loggedIn: Boolean(user), hasAccess });
  if (target !== "next") {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
