"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Abas "Conversas | Funil" do cabeçalho do CRM (D1): usada tanto no topo da
 * lista do Inbox quanto no cabeçalho do board do Funil. Navega por link (são
 * rotas diferentes, `/crm/conversas` e `/crm/funil`), não um Tabs de troca
 * de conteúdo.
 */
const TABS = [
  { href: "/crm/conversas", label: "Conversas" },
  { href: "/crm/funil", label: "Funil" },
];

export function CrmTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-1">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
              active
                ? "bg-secondary text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.3)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
