"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Histórico de snapshots {nodes, edges} do canvas do editor de sequências,
 * pra desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y). Genérico em N/E
 * pra não depender dos tipos concretos de nó/aresta do editor (evita
 * import circular com sequence-editor.tsx).
 *
 * Os arrays de undo/redo vivem em refs, não em estado do React: cada push
 * só precisa disparar um re-render pra atualizar `canUndo`/`canRedo`, e
 * colocar o histórico inteiro em estado geraria uma cópia nova a cada
 * chamada sem necessidade.
 */

const HISTORY_LIMIT = 50;

export interface GraphSnapshot<N, E> {
  nodes: N[];
  edges: E[];
}

export function useGraphHistory<N, E>(initial: GraphSnapshot<N, E>) {
  const past = useRef<GraphSnapshot<N, E>[]>([]);
  const future = useRef<GraphSnapshot<N, E>[]>([]);
  const current = useRef<GraphSnapshot<N, E>>(initial);
  const [, forceRender] = useState(0);

  /** Empilha o snapshot atual e torna `snapshot` o novo presente. Chamar só
   *  em pontos "estáveis" (fim de arrasto, ação discreta) — nunca por frame. */
  const push = useCallback((snapshot: GraphSnapshot<N, E>) => {
    past.current.push(current.current);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    current.current = snapshot;
    future.current = [];
    forceRender((v) => v + 1);
  }, []);

  const undo = useCallback((): GraphSnapshot<N, E> | null => {
    const previous = past.current.pop();
    if (!previous) return null;
    future.current.push(current.current);
    current.current = previous;
    forceRender((v) => v + 1);
    return previous;
  }, []);

  const redo = useCallback((): GraphSnapshot<N, E> | null => {
    const next = future.current.pop();
    if (!next) return null;
    past.current.push(current.current);
    current.current = next;
    forceRender((v) => v + 1);
    return next;
  }, []);

  return {
    push,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
