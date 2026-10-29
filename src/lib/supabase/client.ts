import { createBrowserClient } from "@supabase/ssr";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

/**
 * Client do navegador, autenticado pela sessão dos cookies. Usado só onde o
 * servidor não alcança: o canal do Realtime (WebSocket direto na Supabase).
 * Leituras e escritas continuam em Server Components e Server Actions.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: SESSION_COOKIE_OPTIONS }
  );
}
