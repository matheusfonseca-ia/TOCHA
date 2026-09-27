"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import gsap from "gsap";

import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
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
  icon: Icon,
  index = 0,
}: MetricCardProps) {
  const [display, setDisplay] = useState(value);

  // Conta do zero até o valor real ao montar (chama atenção pro KPI); pula
  // direto pro valor final com "reduzir movimento" ativado ou valor zerado.
  useEffect(() => {
    const { target, suffix } = parseTarget(value);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion || target === 0) {
      setDisplay(value);
      return;
    }
    const counter = { val: 0 };
    const tween = gsap.to(counter, {
      val: target,
      duration: 1,
      ease: "power2.out",
      onUpdate: () => {
        setDisplay(`${Math.round(counter.val).toLocaleString("pt-BR")}${suffix}`);
      },
    });
    return () => {
      tween.kill();
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
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
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
