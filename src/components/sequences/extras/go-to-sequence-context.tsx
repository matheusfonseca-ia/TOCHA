"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * Workflows da conta, disponíveis para o card do nó "Ir para workflow" no
 * canvas (o React Flow só passa `data` pro nó, que guarda só o `sequenceId`
 * — o card resolve o nome por aqui, igual ao provider de automações).
 */

export interface GoToSequenceOption {
  id: string;
  name: string;
}

interface GoToSequenceValue {
  optionsById: Map<string, GoToSequenceOption>;
}

const GoToSequenceContext = createContext<GoToSequenceValue>({
  optionsById: new Map(),
});

export function GoToSequenceProvider({
  sequences,
  children,
}: {
  sequences: GoToSequenceOption[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ optionsById: new Map(sequences.map((s) => [s.id, s])) }),
    [sequences]
  );
  return (
    <GoToSequenceContext.Provider value={value}>{children}</GoToSequenceContext.Provider>
  );
}

export function useGoToSequenceOptions(): GoToSequenceValue {
  return useContext(GoToSequenceContext);
}
