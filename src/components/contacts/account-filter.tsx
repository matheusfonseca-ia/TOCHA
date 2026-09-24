import Link from "next/link";

import { cn } from "@/lib/utils";

/** Filtro por conta (links, igual ao filtro de status da página Logs). */
export function ContactsAccountFilter({
  accounts,
  selectedId,
}: {
  accounts: { id: string; ig_username: string }[];
  selectedId: string;
}) {
  const options = [
    { id: "", label: "Todas as contas" },
    ...accounts.map((a) => ({ id: a.id, label: `@${a.ig_username}` })),
  ];
  return (
    <div className="mb-5 inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border/70 bg-card p-1">
      {options.map((o) => (
        <Link
          key={o.id || "all"}
          href={o.id ? `/contatos?conta=${o.id}` : "/contatos"}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            selectedId === o.id
              ? "bg-secondary text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.3)]"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
