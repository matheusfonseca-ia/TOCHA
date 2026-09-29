"use client";

import { useEffect, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CrmTabs } from "@/modules/crm/shared/components/crm-tabs";

import { BoardColumn } from "./board-column";
import { LeadCard } from "./lead-card";
import { LeadDrawer } from "./lead-drawer";
import { PipelineSwitcher } from "./pipeline-switcher";
import { StageSettingsDialog } from "./stage-settings-dialog";
import { useBoardDnd } from "../hooks/use-board-dnd";
import { usePipelineRealtime } from "../hooks/use-pipeline-realtime";
import { bringExistingConversationsAction, loadMoreLeadsAction, moveLeadAction } from "../services/pipeline.actions";
import type { Board, BoardLeadCard, PipelineOption, PipelineStage } from "../types";

/** As etapas puras (sem cards/estatísticas) para o diálogo de gerenciar etapas. */
function columnsToStages(board: Board): PipelineStage[] {
  return board.columns.map((column) => ({
    id: column.id,
    pipeline_id: column.pipeline_id,
    name: column.name,
    position: column.position,
    color: column.color,
    stage_type: column.stage_type,
    on_enter_sequence_id: column.on_enter_sequence_id,
    created_at: column.created_at,
    updated_at: column.updated_at,
  }));
}

export function PipelineBoard({
  board,
  pipelines,
  sequences,
}: {
  board: Board;
  pipelines: PipelineOption[];
  sequences: { id: string; name: string }[];
}) {
  usePipelineRealtime();
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, { cards: BoardLeadCard[]; hasMore: boolean }>>({});
  const [enrolling, setEnrolling] = useState(false);

  const { columns, activeCard, sensors, handleDragStart, handleDragEnd, setColumns } = useBoardDnd(
    Object.fromEntries(board.columns.map((c) => [c.id, c.cards])),
    (cardId, toStageId, position) => {
      moveLeadAction({ leadId: cardId, toStageId, position }).then((res) => {
        if (res.error) toast.error(res.error);
      });
    }
  );

  // `board` só muda de referência quando o servidor manda dados novos
  // (revalidatePath ou o `router.refresh` do Realtime). Sincroniza o estado
  // local do arrastar com essa fonte da verdade, sem depender de re-render
  // por motivo local (abrir o drawer, "carregar mais" etc).
  useEffect(() => {
    setColumns(Object.fromEntries(board.columns.map((c) => [c.id, c.cards])));
    setExtra({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  async function handleLoadMore(stageId: string) {
    setLoadingMore(stageId);
    const offset = (columns[stageId]?.length ?? 0) + (extra[stageId]?.cards.length ?? 0);
    const res = await loadMoreLeadsAction(board.pipeline.id, stageId, offset);
    setExtra((prev) => ({ ...prev, [stageId]: { cards: [...(prev[stageId]?.cards ?? []), ...res.cards], hasMore: res.hasMore } }));
    setLoadingMore(null);
  }

  async function handleBringExisting() {
    setEnrolling(true);
    const res = await bringExistingConversationsAction(board.pipeline.id);
    setEnrolling(false);
    if (res.error) toast.error(res.error);
    else toast.success(res.enrolled ? `${res.enrolled} conversas trazidas para o funil.` : "Nenhuma conversa nova para trazer.");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <CrmTabs />
          <PipelineSwitcher pipelines={pipelines} selectedId={board.pipeline.id} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={enrolling} onClick={handleBringExisting}>
            {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            Trazer conversas existentes
          </Button>
          <StageSettingsDialog pipeline={board.pipeline} stages={columnsToStages(board)} sequences={sequences} />
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="min-h-0 flex-1 overflow-x-auto p-3">
          <div className="flex h-full min-h-0 gap-3">
            {board.columns.map((column) => {
              const cards = [...(columns[column.id] ?? []), ...(extra[column.id]?.cards ?? [])];
              const hasMore = extra[column.id] ? extra[column.id].hasMore : column.hasMore;
              return (
                <BoardColumn
                  key={column.id}
                  stageId={column.id}
                  name={column.name}
                  color={column.color}
                  cards={cards}
                  count={column.count}
                  valueSum={column.valueSum}
                  hasMore={hasMore}
                  loadingMore={loadingMore === column.id}
                  onOpenCard={setOpenLeadId}
                  onLoadMore={() => handleLoadMore(column.id)}
                />
              );
            })}
          </div>
        </div>

        <DragOverlay>{activeCard ? <LeadCard card={activeCard} onOpen={() => {}} /> : null}</DragOverlay>
      </DndContext>

      <LeadDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
    </div>
  );
}
