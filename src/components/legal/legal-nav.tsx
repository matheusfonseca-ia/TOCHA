"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LEGAL_PAGES } from "@/components/legal/legal-chrome";
import { cn } from "@/lib/utils";

/** Alterna entre as duas páginas públicas, marcando a que está aberta. */
export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LEGAL_PAGES.map((page) => {
        const isCurrent = pathname === page.href;

        return (
          <Link
            key={page.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              isCurrent
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            href={page.href}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
