"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Workflow, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

const SECTION_ITEMS = [
  { href: "/rules", label: "Minhas automações", icon: Zap },
  { href: "/rules/sequencias", label: "Sequências", icon: Workflow },
];

export function AutomationSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="w-44 shrink-0 space-y-0.5">
      {SECTION_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/rules" ? pathname === "/rules" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
              active
                ? "bg-secondary/70 text-foreground"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                active ? "text-primary" : "text-muted-foreground/70"
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
