"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Atualiza o Funil ao vivo: qualquer mudança em `leads` que o RLS deixa o
 * usuário ver re-renderiza o board (`router.refresh`, com debounce). Mesmo
 * padrão do Inbox (`use-inbox-realtime.ts`), incluindo o `setAuth` antes do
 * subscribe: sem isso o canal entra como anon e o RLS descarta os eventos.
 */
export function usePipelineRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel("crm-pipeline")
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
        .subscribe();
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
