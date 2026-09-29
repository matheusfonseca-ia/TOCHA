"use client";

import { useCallback, useMemo, useState } from "react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { positionBetween } from "../utils/fractional-index";
import type { BoardLeadCard } from "../types";

/**
 * Estado e sensores do arrastar do board (@dnd-kit): mantém os cards de cada
 * coluna em memória para o arrastar responder na hora (atualização
 * otimista); `onMove` grava de verdade (server action) e a resposta do
 * servidor por Realtime/`router.refresh` é quem corrige qualquer divergência.
 */
export function useBoardDnd(
  initialColumns: Record<string, BoardLeadCard[]>,
  onMove: (cardId: string, toStageId: string, position: number) => void
) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeCard, setActiveCard] = useState<BoardLeadCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findColumnOf = useCallback(
    (cardId: string) => Object.keys(columns).find((stageId) => columns[stageId].some((c) => c.id === cardId)),
    [columns]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const stageId = findColumnOf(String(event.active.id));
      const card = stageId ? columns[stageId].find((c) => c.id === event.active.id) : null;
      setActiveCard(card ?? null);
    },
    [columns, findColumnOf]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over) return;

      const cardId = String(active.id);
      const fromStageId = findColumnOf(cardId);
      if (!fromStageId) return;

      // Soltar sobre um card mira a coluna dele; soltar sobre a coluna vazia
      // usa o id da própria coluna (ver `droppableId` no BoardColumn).
      const overId = String(over.id);
      const toStageId = columns[overId] ? overId : findColumnOf(overId) ?? fromStageId;
      const targetCards = columns[toStageId] ?? [];
      const overIndex = targetCards.findIndex((c) => c.id === overId);

      setColumns((prev) => {
        const next = { ...prev };
        const movingCard = next[fromStageId].find((c) => c.id === cardId);
        if (!movingCard) return prev;
        next[fromStageId] = next[fromStageId].filter((c) => c.id !== cardId);
        const insertAt = overIndex >= 0 ? overIndex : next[toStageId]?.length ?? 0;
        const destination = [...(next[toStageId] ?? [])];
        destination.splice(insertAt, 0, movingCard);
        next[toStageId] = destination;
        return next;
      });

      const siblings = (columns[toStageId] ?? []).filter((c) => c.id !== cardId);
      const insertAt = overIndex >= 0 ? overIndex : siblings.length;
      const before = insertAt > 0 ? siblings[insertAt - 1]?.position ?? null : null;
      const after = insertAt < siblings.length ? siblings[insertAt]?.position ?? null : null;
      const position = positionBetween(before, after);

      onMove(cardId, toStageId, position);
    },
    [columns, findColumnOf, onMove]
  );

  const columnIds = useMemo(() => Object.keys(columns), [columns]);

  return { columns, columnIds, activeCard, sensors, handleDragStart, handleDragEnd, setColumns };
}
