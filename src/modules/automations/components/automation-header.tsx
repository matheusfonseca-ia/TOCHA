"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus, Workflow, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { AutomationCounts } from "../types";

const CREATE_ITEMS = [
  {
    href: "/rules/nova",
    label: "Nova automação",
    hint: "Responde DM ou comentário por palavra-chave",
    icon: Zap,
  },
  {
    href: "/rules/sequencias/nova",
    label: "Novo workflow",
    hint: "Fluxo completo de conversa no canvas",
    icon: Workflow,
  },
];

/** O editor de workflow é tela cheia e cobre tudo: lá o cabeçalho nem renderiza. */
function isWorkflowEditor(pathname: string) {
  return pathname.startsWith("/rules/sequencias/");
}

/**
 * Cabeçalho da seção Automação: título, menu "Criar" e as abas do topo
 * (estilo da lista de workflows do n8n). Fica no layout de /rules, então
 * vale também pros builders (/rules/nova/**, /rules/[id]/editar), com a aba
 * Automações ativa.
 */
export function AutomationHeader({ counts }: { counts: AutomationCounts }) {
  const pathname = usePathname();
  if (isWorkflowEditor(pathname)) return null;

  const onWorkflows = pathname.startsWith("/rules/sequencias");
  const tabs = [
    { href: "/rules", label: "Automações", count: counts.rules, active: !onWorkflows },
    { href: "/rules/sequencias", label: "Workflow", count: counts.sequences, active: onWorkflows },
  ];

  return (
    <>
      <PageHeader
        title="Automação"
        description="Regras rápidas de palavra-chave e workflows completos de conversa."
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus />
              Criar
              <ChevronDown className="opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {CREATE_ITEMS.map(({ href, label, hint, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild className="items-start gap-3 py-2">
                <Link href={href}>
                  <Icon className="mt-0.5 text-muted-foreground" />
                  <span className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <nav
        aria-label="Seções de automação"
        className="-mt-5 mb-6 flex gap-6 overflow-x-auto border-b border-border/70"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-0.5 pb-2.5 pt-3 text-sm font-medium transition-colors",
              tab.active
                ? "border-foreground text-foreground dark:border-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] tabular-nums",
                tab.active
                  ? "bg-primary/15 text-emerald-800 dark:text-emerald-300"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
