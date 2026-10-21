"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `matchMedia` como estado. No servidor (e na hidratação) devolve false; o
 * valor real chega logo depois de montar. Por isso só serve pra comportamento
 * (tooltip, atalho), nunca pra layout: layout fica no CSS, que já vem certo
 * do servidor.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Mesmo ponto de corte do `md:` do Tailwind: daí pra cima a sidebar é fixa. */
export const DESKTOP_QUERY = "(min-width: 768px)";
