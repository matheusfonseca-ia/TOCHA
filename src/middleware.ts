import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { PUBLIC_PATHS, routeFor } from "@/lib/auth/routing";
import { isAccessStatus, isOwner } from "@/lib/billing/access";

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

  let hasAccess = false;
  if (user) {
    if (isOwner(user.id)) {
      hasAccess = true;
    } else {
      const { data: sub, error } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle<{ status: string }>();
      // Fail-closed: erro de leitura também manda para /assinatura, mas fica no log
      // (a página mostra "não foi possível conferir", não "sem assinatura").
      if (error) console.error("[middleware] falha ao ler subscriptions:", error.message);
      hasAccess = isAccessStatus(sub?.status);
    }
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
