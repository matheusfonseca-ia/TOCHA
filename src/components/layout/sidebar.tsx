"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Instagram,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  X,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FalowLogo } from "@/components/brand/falow-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rules", label: "Automação", icon: Zap },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha o drawer ao navegar para outra página
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
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

      {/* Sidebar: drawer no mobile, fixa no desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border/70 bg-card transition-transform duration-200 md:z-40 md:translate-x-0 md:bg-card/40",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-border/70 px-5">
          <FalowLogo />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-secondary/70 text-foreground"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/70 group-hover:text-muted-foreground"
                  )}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Status + usuário */}
        <div className="border-t border-border/70 p-3">
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
            <span className="text-xs text-muted-foreground">
              Automações ativas
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 px-2.5 py-1">
            <p className="truncate text-[13px] text-muted-foreground" title={userEmail}>
              {userEmail}
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              <ThemeToggle className="h-7 w-7" />
              <form action={signOut}>
                <Button
                  variant="ghost"
                  size="icon"
                  type="submit"
                  title="Sair"
                  className="h-7 w-7 shrink-0 text-muted-foreground/70 hover:text-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
