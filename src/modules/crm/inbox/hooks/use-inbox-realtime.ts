"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel("crm-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe((status, err) => {
        // Sem canal, o Inbox só atualiza ao voltar para a aba: deixa rastro no console.
        if (status === "SUBSCRIBED") console.info("[crm] ao vivo: conectado");
        else console.warn(`[crm] ao vivo: ${status}`, err?.message ?? "");
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router]);
}
