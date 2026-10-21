"use client";

import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/app/login/actions";

import { RailTooltip } from "./rail-tooltip";

function SignOutButton({ className }: { className?: string }) {
  return (
    // flex: sem caixa de linha em volta do botão, a altura é só a dele (a
    // pilha da sidebar recolhida tem altura fixa no CSS)
    <form action={signOut} className="flex">
      <Button
        variant="ghost"
        size="icon"
        type="submit"
        title="Sair"
        aria-label="Sair"
        className={cn(
          "shrink-0 text-muted-foreground/70 hover:text-foreground",
          className
        )}
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

/**
 * Status + usuário. Aberta: e-mail com tema e sair na mesma linha. Recolhida:
 * tema e sair empilhados no trilho, sem e-mail. As duas versões ocupam a
 * mesma célula do grid e trocam por opacidade (cada uma parada no seu lugar);
 * a altura do bloco anima junto com a largura da sidebar (globals.css,
 * `.shell-footer-actions`).
 */
export function SidebarFooter({
  userEmail,
  rail,
}: {
  userEmail: string;
  /** Recolhida no desktop: liga o tooltip do status. */
  rail: boolean;
}) {
  return (
    <div className="shrink-0 border-t border-border/70 p-3">
      <RailTooltip label="Automações ativas" enabled={rail}>
        <div className="flex h-8 items-center">
          {/* Ponto no centro do trilho (x=32), igual aos ícones do menu */}
          <span className="flex w-10 shrink-0 justify-center" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          </span>
          <span className="shell-label whitespace-nowrap text-xs text-muted-foreground">
            Automações ativas
          </span>
        </div>
      </RailTooltip>

      <div className="shell-footer-actions mt-1 grid">
        {/* Largura fixa: ao encolher, tema e sair são cortados, não arrastados */}
        <div className="shell-expanded-only col-start-1 row-start-1 flex h-9 w-[13.5rem] items-center justify-between gap-2 pl-3">
          <p
            className="min-w-0 truncate text-[13px] text-muted-foreground"
            title={userEmail}
          >
            {userEmail}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <ThemeToggle className="h-7 w-7" />
            <SignOutButton className="h-7 w-7" />
          </div>
        </div>

        <div className="shell-collapsed-only col-start-1 row-start-1 hidden w-10 flex-col items-center gap-0.5 py-1 md:flex">
          <ThemeToggle className="h-8 w-8" />
          <SignOutButton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
