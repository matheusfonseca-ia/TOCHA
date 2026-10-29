"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Filtro do Realtime para as contas do usuário. Com filtro o servidor do
 * Realtime descarta cedo o que é de outro cliente, em vez de avaliar o RLS
 * de cada painel aberto para cada mensagem de todo mundo. O `in` do
 * Realtime aceita até 100 valores.
 */
export function accountFilter(accountIds: readonly string[]): string | null {
  const ids = accountIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (ids.length === 0) return null;
  return ids.length === 1 ? `account_id=eq.${ids[0]}` : `account_id=in.(${ids.join(",")})`;
}

/**
 * Atualiza o Inbox ao vivo: mudança em `conversations` das contas da tela
 * (lista: última mensagem, não lidas, status) ou em `messages` da conversa
 * aberta (reação, edição, apagada) re-renderiza a página no servidor
 * (`router.refresh`, com debounce para rajadas do webhook). Mensagem nova de
 * outra conversa já chega pela própria `conversations` (o trigger atualiza a
 * última mensagem). Voltar para a aba também atualiza, como rede de
 * segurança se o WebSocket cair.
 */
export function useInboxRealtime({
  accountIds,
  conversationId,
}: {
  accountIds: readonly string[];
  conversationId: string | null;
}) {
  const router = useRouter();
  const accountsKey = accountFilter(accountIds);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      // Uma mensagem gera vários eventos (mensagem, conversa, trigger) em até
      // ~1s; cada refresh re-renderiza a página no servidor.
      timer = setTimeout(() => router.refresh(), 1000);
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

      if (!accountsKey) return;
      let next = supabase
        .channel(`crm-inbox:${conversationId ?? "lista"}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: accountsKey }, refresh);
      if (conversationId) {
        next = next.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          refresh
        );
      }
      channel = next.subscribe((status, err) => {
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
  }, [router, accountsKey, conversationId]);
}
