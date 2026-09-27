"use client";

import { createContext, useContext } from "react";

import type { SequenceNodeData } from "@/types/sequence";

/**
 * Como cada nó do canvas grava a própria edição (feita dentro do card, estilo
 * ManyChat) de volta no estado do editor. O React Flow só passa `id`/`data`
 * pro nó — esse contexto é o único jeito de o nó chamar `handleDataChange`
 * (definido em sequence-editor.tsx) sem prop-drilling por todo tipo de nó.
 */

type OnNodeDataChange = (nodeId: string, data: SequenceNodeData) => void;

const noop: OnNodeDataChange = () => {};

const NodeDataContext = createContext<OnNodeDataChange>(noop);

export function NodeDataProvider({
  onChange,
  children,
}: {
  onChange: OnNodeDataChange;
  children: React.ReactNode;
}) {
  return (
    <NodeDataContext.Provider value={onChange}>{children}</NodeDataContext.Provider>
  );
}

export function useNodeDataChange(): OnNodeDataChange {
  return useContext(NodeDataContext);
}
