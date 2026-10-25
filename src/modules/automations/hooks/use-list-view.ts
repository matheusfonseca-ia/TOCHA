"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import type { ListView } from "../types";
import {
  DEFAULT_VIEW,
  hasViewParams,
  parseListView,
  serializeListView,
  type SortConfig,
} from "../utils/list-view";

const URL_SYNC_DELAY_MS = 250;

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Aba anônima ou storage bloqueado: a URL continua guardando a visão.
  }
}

/**
 * Busca, filtros, ordenação e pasta da lista, espelhados na URL. A troca usa
 * `history.replaceState` (o Next 14.2 sincroniza com `useSearchParams`), então
 * digitar na busca não busca dados no servidor. O editor e os builders voltam
 * com `router.push("/rules")` sem parâmetros: nesse caso só a ORDENAÇÃO da
 * sessão (sessionStorage) é retomada. Busca, status, pasta, tipo e conta não:
 * depois de criar algo, um filtro antigo esconderia o item novo e pareceria
 * que não salvou.
 */
export function useListView(storageKey: string, sorts: SortConfig) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ListView>(() => parseListView(searchParams, sorts));
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (hasViewParams(searchParams)) return;
    const saved = readSession(storageKey);
    if (!saved) return;
    // Valor salvo que a lista não oferece (ou inválido) cai no padrão dela.
    const { sort } = parseListView(new URLSearchParams(saved), sorts);
    if (sort !== sorts.default) setView((current) => ({ ...current, sort }));
    // Só na montagem: depois disso quem manda é o estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espera a digitação parar: o Safari limita replaceState a ~100 por 30s.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const qs = serializeListView(view, sorts);
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, "", url);
      }
      writeSession(storageKey, qs);
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [view, pathname, storageKey, sorts]);

  const update = useCallback((patch: Partial<ListView>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  /** Limpa os filtros e mantém a ordenação escolhida. */
  const reset = useCallback(() => {
    setView((current) => ({ ...DEFAULT_VIEW, sort: current.sort }));
  }, []);

  return { view, update, reset };
}
