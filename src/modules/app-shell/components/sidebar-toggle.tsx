"use client";

import { useEffect, useRef } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSidebarShortcutKeys } from "../hooks/use-sidebar-shortcut";
import { RailTooltip } from "./rail-tooltip";

function ShortcutHint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <span className="flex items-center gap-0.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="min-w-[1.125rem] rounded border border-border bg-muted px-1 text-center font-sans text-[10px] font-medium leading-4 text-muted-foreground"
          >
            {key}
          </kbd>
        ))}
      </span>
    </span>
  );
}

/**
 * Os dois controles de alternar, só do md pra cima (no celular é o drawer).
 *
 * Aberta: botão no canto direito do cabeçalho, ao lado do logo.
 * Recolhida: o próprio símbolo vira o botão; no hover/foco o ícone de painel
 * cobre o símbolo. Cada botão fica parado no seu lugar e só um existe por vez
 * (o outro está com visibility: hidden pelo CSS do shell), então nada desliza
 * na horizontal durante a animação.
 */
export function SidebarToggle({
  collapsed,
  onToggle,
  controls,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** id do <aside>, pro aria-controls. */
  controls: string;
}) {
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const keys = useSidebarShortcutKeys();
  const ariaKeys = keys[0] === "⌘" ? "Meta+B" : "Control+B";

  // Foco estava no botão que acabou de sumir (Enter/Espaço nele, ou Ctrl+B
  // com ele focado): passa pro botão do novo estado em vez de ficar no nada.
  useEffect(() => {
    const active = document.activeElement;
    if (collapsed && active === collapseRef.current) {
      expandRef.current?.focus();
    } else if (!collapsed && active === expandRef.current) {
      collapseRef.current?.focus();
    }
  }, [collapsed]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Clique de mouse (detail > 0) solta o foco: senão o efeito acima levaria
    // o foco pro outro botão e o tooltip dele abriria sozinho.
    if (event.detail > 0) event.currentTarget.blur();
    onToggle();
  };

  return (
    <>
      {/* left fixo (não right): ao encolher ele é cortado, não arrastado */}
      <span className="shell-expanded-only absolute left-[12.5rem] top-3.5 hidden md:flex">
        <RailTooltip label={<ShortcutHint label="Recolher menu" keys={keys} />}>
          <Button
            ref={collapseRef}
            variant="ghost"
            size="icon"
            onClick={handleClick}
            aria-label="Recolher menu"
            aria-expanded
            aria-controls={controls}
            aria-keyshortcuts={ariaKeys}
            className="h-7 w-7 text-muted-foreground/70 hover:text-foreground"
          >
            <PanelLeftClose />
          </Button>
        </RailTooltip>
      </span>

      {/* Em cima do símbolo do logo (24px em 20..44, centro no trilho de 64px) */}
      <span className="shell-collapsed-only absolute left-4 top-3 hidden md:flex">
        <RailTooltip
          label={<ShortcutHint label="Expandir menu" keys={keys} />}
          sideOffset={18}
        >
          <Button
            ref={expandRef}
            variant="ghost"
            size="icon"
            onClick={handleClick}
            aria-label="Expandir menu"
            aria-expanded={false}
            aria-controls={controls}
            aria-keyshortcuts={ariaKeys}
            className="group/expand h-8 w-8 bg-transparent text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary"
          >
            <PanelLeftOpen className="opacity-0 transition-opacity duration-150 group-hover/expand:opacity-100 group-focus-visible/expand:opacity-100" />
          </Button>
        </RailTooltip>
      </span>
    </>
  );
}
