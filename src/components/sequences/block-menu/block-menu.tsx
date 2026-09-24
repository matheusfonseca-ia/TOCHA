"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SequenceNodeType } from "@/types/sequence";

export interface BlockMenuItem {
  type: SequenceNodeType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 320;

/**
 * Menu flutuante de blocos no canvas: abre ao soltar uma seta no vazio
 * (o bloco escolhido já nasce conectado) ou com o botão direito (bloco solto
 * na posição do clique). Busca por nome; Enter escolhe o 1º resultado.
 */
export function BlockMenu({
  items,
  left,
  top,
  containerWidth,
  containerHeight,
  connecting,
  onPick,
  onClose,
}: {
  items: readonly BlockMenuItem[];
  /** Posição do clique/soltura, relativa ao container do canvas. */
  left: number;
  top: number;
  containerWidth: number;
  containerHeight: number;
  /** true = veio de uma seta solta (o bloco nasce ligado a ela). */
  connecting: boolean;
  onPick: (type: SequenceNodeType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Mantém o menu inteiro dentro do canvas (clique perto da borda).
  const x = Math.max(8, Math.min(left, containerWidth - MENU_WIDTH - 8));
  const y = Math.max(8, Math.min(top, containerHeight - MENU_MAX_HEIGHT - 8));

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={connecting ? "Conectar novo bloco" : "Adicionar bloco"}
      className="absolute z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ left: x, top: y, width: MENU_WIDTH }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-border px-3 py-2">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {connecting ? "Conectar novo bloco" : "Adicionar bloco aqui"}
        </p>
        <div className="flex items-center gap-2 rounded-md border border-input px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                onPick(filtered[0].type);
              }
            }}
            placeholder="Buscar bloco"
            aria-label="Buscar bloco"
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="overflow-y-auto py-1" style={{ maxHeight: MENU_MAX_HEIGHT - 72 }}>
        {filtered.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            role="menuitem"
            onClick={() => onPick(type)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
              "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {label}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum bloco com esse nome.</p>
        )}
      </div>
    </div>
  );
}
