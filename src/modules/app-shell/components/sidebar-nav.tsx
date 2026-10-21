"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Instagram,
  LayoutDashboard,
  MessagesSquare,
  ScrollText,
  Users,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { formatUnreadCount, unreadLabel } from "../utils/unread-count";
import { RailTooltip } from "./rail-tooltip";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm", label: "Conversas", icon: MessagesSquare },
  { href: "/rules", label: "Automação", icon: Zap },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

/**
 * Itens do menu. Geometria pensada pro trilho de 64px: nav com px-3 e coluna
 * do ícone com 40px, então o ícone fica centrado em x=32 nos dois estados e
 * nunca anda. O rótulo mora numa caixa de largura fixa (w-44) que só é
 * cortada pelo overflow do link quando a sidebar encolhe: texto não quebra e
 * a pílula de não lidas não desliza junto com a borda.
 */
export function SidebarNav({
  pathname,
  crmUnread,
  rail,
}: {
  pathname: string;
  crmUnread: number;
  /** Recolhida no desktop: liga os tooltips. */
  rail: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const positionedRef = useRef(false);

  // Desliza o indicador até o item ativo em vez de trocar de estado sem
  // transição: feedback de "onde eu estou" ao navegar. Sem transição na
  // primeira medição (só encaixa na posição certa) e pulando pro estado
  // final com "reduzir movimento" ativado. Import dinâmico: gsap só carrega
  // no navegador, nunca durante o SSR. A largura do indicador vem de
  // left-3/right-3, então ele acompanha a sidebar abrindo e recolhendo
  // sozinho; só y e altura são medidos.
  useEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const activeLink = nav.querySelector<HTMLAnchorElement>(
      '[data-active="true"]'
    );
    if (!activeLink) {
      indicator.style.opacity = "0";
      return;
    }
    const y = activeLink.offsetTop;
    const height = activeLink.offsetHeight;
    let cancelled = false;
    import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      const reduceMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        !positionedRef.current;
      gsap.to(indicator, {
        y,
        height,
        opacity: 1,
        duration: reduceMotion ? 0 : 0.35,
        ease: "power2.out",
      });
      positionedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label="Menu principal"
      className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-4"
    >
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute left-3 right-3 top-0 z-0 rounded-md bg-secondary/70 opacity-0"
      />
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        const unread = href === "/crm" ? crmUnread : 0;
        return (
          <RailTooltip
            key={href}
            enabled={rail}
            label={unread > 0 ? `${label} (${unreadLabel(unread)})` : label}
          >
            <Link
              href={href}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative z-10 flex h-9 items-center overflow-hidden rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              )}
            >
              <span className="flex w-10 shrink-0 justify-center">
                <span className="relative flex">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      active
                        ? "text-primary"
                        : "text-muted-foreground/70 group-hover:text-muted-foreground"
                    )}
                  />
                  {unread > 0 && (
                    // Recolhida: a pílula some e o número vai pro canto do
                    // ícone. aria-hidden porque a pílula (mesmo invisível)
                    // continua sendo o que o leitor de tela anuncia.
                    <span
                      aria-hidden
                      className="shell-unread-dot absolute -right-2 -top-1.5 hidden h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-background md:flex"
                    >
                      {formatUnreadCount(unread, 9)}
                    </span>
                  )}
                </span>
              </span>
              <span className="shell-label flex w-44 shrink-0 items-center whitespace-nowrap pr-3">
                {label}
                {unread > 0 && (
                  <span
                    className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
                    aria-label={unreadLabel(unread)}
                  >
                    {formatUnreadCount(unread, 99)}
                  </span>
                )}
              </span>
            </Link>
          </RailTooltip>
        );
      })}
    </nav>
  );
}
