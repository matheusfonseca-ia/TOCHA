"use client";

import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Folga para o mouse ir da linha até a lixeira sem ela sumir no caminho. */
const HIDE_DELAY_MS = 200;

/**
 * Conexão do canvas com lixeira: aparece ao passar o mouse na linha (ou com
 * a conexão selecionada, que cobre toque no celular). Excluir passa pelo
 * deleteElements do React Flow, então entra no desfazer (Ctrl+Z).
 */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [hover, setHover] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    []
  );

  const show = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    setHover(true);
  };
  const hide = () => {
    hideTimer.current = window.setTimeout(() => setHover(false), HIDE_DELAY_MS);
  };

  const active = hover || selected;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ ...style, strokeWidth: active ? 3 : style?.strokeWidth }}
      />
      {/* Faixa invisível mais larga: facilita acertar a linha com o mouse. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        onMouseEnter={show}
        onMouseLeave={hide}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label="Excluir conexão"
          title="Excluir conexão"
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={(e) => {
            e.stopPropagation();
            deleteElements({ edges: [{ id }] });
          }}
          className={cn(
            "nodrag nopan absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-opacity",
            "hover:border-destructive hover:bg-destructive hover:text-destructive-foreground",
            active ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: active ? "all" : "none",
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
