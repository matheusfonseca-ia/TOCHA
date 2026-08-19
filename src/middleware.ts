import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Rotas públicas. A landing ("/") é a porta de entrada do domínio e precisa
// abrir sem login — é ela que a análise da Meta encontra ao visitar o app.
// As três páginas do grupo (legal) são as URLs cadastradas no painel da Meta
// (Privacy Policy URL, User Data Deletion e Terms of Service) e também têm de
// abrir sem login e sem redirecionamento.
const PUBLIC_PATHS = new Set([
  "/",
  "/privacidade",
  "/exclusao-de-dados",
  "/termos-de-servico",
]);

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

  if (!user && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
