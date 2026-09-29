"use client";

import { createContext, useContext } from "react";

import type { MessagePreset } from "@/lib/presets/presets";

/**
 * Presets e disponibilidade da IA carregados uma vez no layout do painel e
 * lidos por qualquer campo, em qualquer profundidade — inclusive dentro dos
 * cards do canvas do Workflow, onde passar prop até o nó seria um inferno.
 */
interface SmartFieldsValue {
  presets: MessagePreset[];
  aiEnabled: boolean;
}

const SmartFieldsContext = createContext<SmartFieldsValue>({
  presets: [],
  aiEnabled: false,
});

export function SmartFieldsProvider({
  presets,
  aiEnabled,
  children,
}: SmartFieldsValue & { children: React.ReactNode }) {
  return (
    <SmartFieldsContext.Provider value={{ presets, aiEnabled }}>
      {children}
    </SmartFieldsContext.Provider>
  );
}

export function useSmartFields(): SmartFieldsValue {
  return useContext(SmartFieldsContext);
}
