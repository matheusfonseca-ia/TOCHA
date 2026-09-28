"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Atualiza o Inbox ao vivo: qualquer mudança em `messages` ou `conversations`
 * que o RLS deixa o usuário ver re-renderiza a página no servidor
 * (`router.refresh`, com debounce para rajadas do webhook). Voltar para a aba
 * também atualiza, como rede de segurança se o WebSocket cair.
 */
export function useInboxRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    void (async () => {
      // O supabase-js só repassa o token ao Realtime em SIGNED_IN e
      // TOKEN_REFRESHED; sessão restaurada dos cookies (INITIAL_SESSION) não
      // entra. Sem isto o canal entra como `anon` e o RLS descarta todo
      // evento em silêncio (visto em produção em 28/09/2026).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel("crm-inbox")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
        .subscribe((status, err) => {
          // Sem canal, o Inbox só atualiza ao voltar para a aba: deixa rastro no console.
          if (status === "SUBSCRIBED") console.info("[crm] ao vivo: conectado");
          else console.warn(`[crm] ao vivo: ${status}`, err?.message ?? "");
        });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);
}
