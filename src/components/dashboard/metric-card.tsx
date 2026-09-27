"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Ícone já renderizado (ex.: <MessageSquare className="..." />), não o
   *  componente em si — referência de função não atravessa a fronteira
   *  servidor/cliente (MetricCard é "use client"). */
  icon: ReactNode;
  index?: number;
}

/** Extrai o alvo numérico de valores como "1.234" ou "42%" pro count-up. */
function parseTarget(value: string): { target: number; suffix: string } {
  const digits = value.replace(/\D/g, "");
  const suffix = value.match(/[^\d.,]+$/)?.[0] ?? "";
  return { target: digits ? parseInt(digits, 10) : 0, suffix };
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  index = 0,
}: MetricCardProps) {
  const [display, setDisplay] = useState(value);

  // Conta do zero até o valor real ao montar (chama atenção pro KPI); pula
  // direto pro valor final com "reduzir movimento" ativado ou valor zerado.
  // Import dinâmico: gsap só carrega no navegador, nunca durante o SSR.
  useEffect(() => {
    const { target, suffix } = parseTarget(value);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion || target === 0) {
      setDisplay(value);
      return;
    }
    let cancelled = false;
    let tween: { kill: () => void } | undefined;
    import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      const counter = { val: 0 };
      tween = gsap.to(counter, {
        val: target,
        duration: 1,
        ease: "power2.out",
        onUpdate: () => {
          setDisplay(`${Math.round(counter.val).toLocaleString("pt-BR")}${suffix}`);
        },
      });
    });
    return () => {
      cancelled = true;
      tween?.kill();
    };
  }, [value]);

  return (
    <Card
      className="stagger-item"
      style={{ "--stagger-index": index } as React.CSSProperties}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            {label}
          </p>
          {icon}
        </div>
        <p className="mt-3 font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {display}
        </p>
        {hint && (
          <p className="mt-2 text-xs text-muted-foreground/70">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
