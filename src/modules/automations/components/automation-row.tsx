"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Folder } from "@/lib/folders/folders";
import { cn } from "@/lib/utils";

import { createdDate } from "../utils/display";
import { folderDotClass } from "../utils/folder-colors";

export interface RowMetric {
  value: number;
  singular: string;
  plural: string;
}

/** Contorno da lista: um Card com divisórias, sem tabela e sem largura mínima. */
export function AutomationList({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border/70">{children}</ul>
    </Card>
  );
}

/**
 * Linha larga da lista de Automações e Workflow. O título é o controle que
 * abre (link ou botão) e estica um ::after por cima da linha inteira, então
 * clicar em qualquer ponto abre e o Enter funciona pelo próprio foco. Switch
 * e menu ficam numa camada acima, sem disparar a abertura.
 */
export function AutomationRow({
  index,
  icon: Icon,
  title,
  href,
  onOpen,
  triggerLine,
  updatedAt,
  createdAt,
  gender,
  badges,
  metrics,
  active,
  onToggle,
  toggleDisabled,
  menu,
}: {
  /** Posição na lista, para a entrada escalonada. */
  index: number;
  icon: LucideIcon;
  title: string;
  /** Abre navegando (builder/editor)... */
  href?: string;
  /** ...ou abrindo algo na própria tela (diálogo). */
  onOpen?: () => void;
  triggerLine: string;
  updatedAt: string;
  createdAt: string;
  /** Concordância: automação (f) ou workflow (m). */
  gender: "f" | "m";
  badges?: React.ReactNode;
  metrics: RowMetric[];
  active: boolean;
  onToggle: (next: boolean) => void;
  toggleDisabled?: boolean;
  menu: React.ReactNode;
}) {
  const suffix = gender === "f" ? "a" : "o";
  const openClass =
    "block max-w-full truncate text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring/50";

  return (
    <li
      className="stagger-item group relative flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/30 motion-reduce:animate-none lg:flex-row lg:items-center lg:gap-6 lg:px-5"
      style={{ "--stagger-index": Math.min(index, 10) } as React.CSSProperties}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-secondary/40 text-muted-foreground transition-colors group-hover:text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} prefetch={false} className={openClass}>
              {title}
            </Link>
          ) : (
            <button type="button" onClick={onOpen} className={openClass}>
              {title}
            </button>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{triggerLine}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
            <span suppressHydrationWarning>
              Atualizad{suffix}{" "}
              {formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: ptBR })}
            </span>
            <span aria-hidden>·</span>
            <span>
              Criad{suffix} em {createdDate(createdAt)}
            </span>
            {badges}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pl-12 lg:shrink-0 lg:justify-end lg:pl-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {metrics.map((metric) => (
            <span key={metric.plural} className="whitespace-nowrap">
              <span className="font-medium tabular-nums text-foreground">{metric.value}</span>{" "}
              {metric.value === 1 ? metric.singular : metric.plural}
            </span>
          ))}
        </div>
        <div className="relative z-10 flex items-center gap-1">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1">
            <Switch
              checked={active}
              onCheckedChange={onToggle}
              disabled={toggleDisabled}
              aria-label={`${gender === "f" ? "Automação" : "Workflow"} ${title} ativ${suffix}`}
            />
            <span
              aria-hidden
              className={cn(
                "min-w-[3.25rem] text-xs font-medium",
                active ? "text-success" : "text-muted-foreground"
              )}
            >
              {active ? `Ativ${suffix}` : `Pausad${suffix}`}
            </span>
          </label>
          {menu}
        </div>
      </div>
    </li>
  );
}

/** Selo da pasta na linha (só aparece com "todas" aberto). */
export function FolderChip({ folder }: { folder: Folder }) {
  return (
    <Badge variant="outline" className="max-w-[12rem] gap-1.5">
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", folderDotClass(folder.color))} />
      <span className="min-w-0 truncate">{folder.name}</span>
    </Badge>
  );
}

/** Lista vazia por causa da busca, dos filtros ou da pasta aberta. */
export function NoResults({
  message,
  onReset,
}: {
  message: string;
  onReset?: () => void;
}) {
  return (
    <Card className="animate-fade-up motion-reduce:animate-none">
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </Card>
  );
}
