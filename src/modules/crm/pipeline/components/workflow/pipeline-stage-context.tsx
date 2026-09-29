"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * Etapas dos funis da conta, disponíveis para os cards do editor que
 * referenciam uma etapa (nó "Mover para etapa" e a condição "Está na
 * etapa"), mesmo padrão do provider de "Ir para workflow": o React Flow só
 * passa `data` (o id) pro nó, e o card resolve o nome/funil por aqui.
 */

export interface PipelineStageOption {
  id: string;
  name: string;
  pipelineName: string;
  accountId: string;
}

interface PipelineStageValue {
  optionsById: Map<string, PipelineStageOption>;
  options: PipelineStageOption[];
}

const PipelineStageContext = createContext<PipelineStageValue>({
  optionsById: new Map(),
  options: [],
});

export function PipelineStageProvider({
  stages,
  children,
}: {
  stages: PipelineStageOption[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      optionsById: new Map(stages.map((s) => [s.id, s])),
      options: stages,
    }),
    [stages]
  );
  return <PipelineStageContext.Provider value={value}>{children}</PipelineStageContext.Provider>;
}

export function usePipelineStageOptions(): PipelineStageValue {
  return useContext(PipelineStageContext);
}
