"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Instagram,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOut } from "@/app/login/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rules", label: "Automação", icon: Zap },
  { href: "/accounts", label: "Contas", icon: Instagram },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card/60 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow-primary">
          <Zap className="h-4 w-4 text-white" fill="currentColor" />
        </div>
        <span className="font-display text-lg font-bold tracking-tight">
          Insta<span className="text-gradient">Reply</span>
        </span>
      </div>

      <Separator />

      {/* Navegação */}
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-primary/15 text-foreground shadow-[inset_2px_0_0_0_hsl(258_90%_66%)]"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  active ? "text-primary" : "group-hover:text-primary/80"
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Status + usuário */}
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2 rounded-md bg-background/50 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="text-xs text-muted-foreground">
            Automações ativas
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{userEmail}</p>
            <p className="text-[11px] text-muted-foreground">Plano Free</p>
          </div>
          <form action={signOut}>
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              title="Sair"
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
