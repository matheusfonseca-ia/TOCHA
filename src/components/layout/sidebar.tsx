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
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border/70 bg-card/40">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border/70 px-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
          <Zap className="h-3.5 w-3.5 text-white" fill="currentColor" />
        </div>
        <span className="font-display text-[15px] font-semibold tracking-tight">
          InstaReply
        </span>
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
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="text-xs text-muted-foreground">
            Automações ativas
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 px-2.5 py-1">
          <p className="truncate text-[13px] text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
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
    </aside>
  );
}
