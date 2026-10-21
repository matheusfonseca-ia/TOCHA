"use client";

import { useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Tooltip à direita do trilho da sidebar. Abre no hover e no foco do teclado
 * (comportamento do Radix). Com `enabled` false nunca abre: o filho continua
 * o mesmo elemento no DOM, então alternar a sidebar não remonta o link nem
 * tira o foco dele.
 */
export function RailTooltip({
  label,
  enabled = true,
  sideOffset = 14,
  children,
}: {
  label: React.ReactNode;
  enabled?: boolean;
  /** Distância do gatilho. 14px leva o tooltip pra fora da borda do trilho. */
  sideOffset?: number;
  children: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  // Sidebar abriu com o tooltip aberto: fecha, senão ele volta ao recolher
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  // Desligado, ignora o "abrir" do Radix: com o prop controlado em false o
  // Radix não manda o "fechar" depois, e o true ficaria guardado até recolher.
  return (
    <Tooltip
      open={enabled && open}
      onOpenChange={(next) => setOpen(enabled && next)}
    >
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={sideOffset}
        className="px-2.5 py-1 text-xs font-medium shadow-lg"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
