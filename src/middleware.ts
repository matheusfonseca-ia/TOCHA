import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_MFA_PATH, adminNeedsMfa } from "@/lib/admin/mfa";
import { PUBLIC_PATHS, accessMatters, isAdminPath, routeFor } from "@/lib/auth/routing";
import { hasActiveAccess, isAdmin } from "@/lib/billing/access";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas de API cuidam da própria autenticação (webhook usa assinatura HMAC).
  // Server actions disparadas a partir destas rotas conferem o acesso por
  // conta própria (lib/auth/require-access.ts): o middleware não é a única trava.
  if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
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

  /**
   * Redirect/rewrite são respostas novas: sem copiar os cookies que o
   * getUser() acabou de renovar, o navegador ficaria com o refresh token já
   * gasto e a sessão cairia na próxima requisição.
   */
  const withSession = (next: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
    return next;
  };

  // Importante: getUser() revalida o JWT e renova a sessão via cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAdminPath(pathname)) {
    // /admin não existe para quem não é admin: 404, sem revelar a área.
    if (!isAdmin(user.id)) {
      const url = request.nextUrl.clone();
      url.pathname = "/404";
      return withSession(NextResponse.rewrite(url, { status: 404 }));
    }
    // Admin com sessão só de senha (aal1) quando o segundo fator é exigido:
    // só a tela de cadastro/confirmação do código abre.
    if (pathname !== ADMIN_MFA_PATH && (await adminNeedsMfa(supabase))) {
      const url = request.nextUrl.clone();
      url.pathname = ADMIN_MFA_PATH;
      url.search = "";
      return withSession(NextResponse.redirect(url));
    }
  }

  // Regra única (admin → bloqueio → cortesia → assinatura); o client do usuário
  // lê só as próprias linhas de access_grants e subscriptions (RLS). Só consulta
  // quando o destino depende disso (ex.: /assinatura abre de qualquer jeito).
  const hasAccess = user && accessMatters(pathname) ? await hasActiveAccess(supabase, user.id) : false;

  const target = routeFor(pathname, { loggedIn: Boolean(user), hasAccess });
  if (target !== "next") {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return withSession(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tudo menos os arquivos do build e os ícones da raiz. A exclusão é por
     * prefixo/caminho exato, não por extensão: /rules/sequencias/x.png é uma
     * página (rota dinâmica) e precisa passar pela checagem de acesso.
     */
    "/((?!_next/static/|_next/image|favicon\\.ico$|icon\\.svg$).*)",
  ],
};
