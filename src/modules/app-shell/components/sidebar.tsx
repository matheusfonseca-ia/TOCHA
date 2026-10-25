"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FalowLogo } from "@/components/brand/falow-logo";
import { ThemeToggle } from "@/components/theme-toggle";

import { DESKTOP_QUERY, useMediaQuery } from "../hooks/use-media-query";
import { useSidebarShortcut } from "../hooks/use-sidebar-shortcut";
import { useAppShell } from "./app-shell-provider";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNav } from "./sidebar-nav";
import { SidebarToggle } from "./sidebar-toggle";

const SIDEBAR_ID = "app-sidebar";

/**
 * Sidebar do painel. Celular: topbar + drawer, sempre com rótulos. Do md pra
 * cima: fixa, aberta (15rem) ou recolhida (4rem, só ícones).
 *
 * A largura vem de `--sidebar-w` (animada no `.app-shell`, globals.css), a
 * mesma variável do conteúdo e das telas em tela cheia. O que aparece e some
 * em cada estado é CSS puro a partir do `data-sidebar` do wrapper (classes
 * `shell-*`), então o primeiro quadro já sai certo do servidor. O JS só cuida
 * de comportamento: tooltips, atalho e foco.
 */
export function Sidebar({
  userEmail,
  crmUnread = 0,
  showBilling = false,
  showAdmin = false,
}: {
  userEmail: string;
  /** Mensagens não lidas no Inbox do CRM (badge do item Conversas). */
  crmUnread?: number;
  /** Mostra "Minha assinatura" (portal da Stripe). Fica de fora pro dono e admins, que não têm assinatura. */
  showBilling?: boolean;
  /** Mostra o link do painel /admin (só admins). */
  showAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { collapsed, toggle } = useAppShell();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // No celular a preferência salva não vale: drawer sempre com rótulos
  const rail = collapsed && isDesktop;
  const [open, setOpen] = useState(false);

  useSidebarShortcut(toggle, isDesktop);

  // Fecha o drawer ao navegar para outra página
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <TooltipProvider
      delayDuration={200}
      skipDelayDuration={300}
      disableHoverableContent
    >
      {/* Topbar mobile */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:hidden">
        <FalowLogo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls={SIDEBAR_ID}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Backdrop do drawer mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar: drawer no mobile, fixa no desktop. overflow-hidden é o que
          corta rótulos e controles de largura fixa enquanto ela encolhe. */}
      <aside
        id={SIDEBAR_ID}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col overflow-hidden border-r border-border/70 bg-card transition-transform duration-200 md:z-40 md:w-[var(--sidebar-w)] md:translate-x-0 md:bg-card/40",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo: px-5 põe o símbolo (24px) centrado no trilho de 64px; a
            palavra apaga ao recolher e o símbolo fica onde está. */}
        <div className="relative flex h-14 shrink-0 items-center border-b border-border/70 px-5">
          <FalowLogo wordmarkClassName="shell-wordmark" />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </Button>
          <SidebarToggle
            collapsed={collapsed}
            onToggle={toggle}
            controls={SIDEBAR_ID}
          />
        </div>

        <SidebarNav pathname={pathname} crmUnread={crmUnread} rail={rail} />
        <SidebarFooter
          userEmail={userEmail}
          rail={rail}
          showAdmin={showAdmin}
          showBilling={showBilling}
        />
      </aside>
    </TooltipProvider>
  );
}
