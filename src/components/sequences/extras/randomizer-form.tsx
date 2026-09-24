"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_RANDOMIZER_BRANCHES,
  MIN_RANDOMIZER_BRANCHES,
  RANDOMIZER_WEIGHT_TOTAL,
} from "@/lib/sequences/graph";
import type { RandomizerNodeData } from "@/types/sequence";

/** Formulário do inspector para o nó "Aleatório" (teste A/B). */
export function RandomizerForm({
  data,
  patch,
}: {
  data: RandomizerNodeData;
  patch: (d: RandomizerNodeData) => void;
}) {
  const total = data.branches.reduce((sum, b) => sum + b.weight, 0);

  function setBranch(i: number, partial: Partial<RandomizerNodeData["branches"][number]>) {
    patch({
      ...data,
      branches: data.branches.map((b, idx) => (idx === i ? { ...b, ...partial } : b)),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data.branches.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder={`Caminho ${i + 1}`}
              maxLength={40}
              value={b.label}
              onChange={(e) => setBranch(i, { label: e.target.value })}
            />
            <div className="flex shrink-0 items-center gap-1">
              <Input
                type="number"
                min={1}
                max={100}
                className="w-16"
                value={Number.isFinite(b.weight) ? b.weight : ""}
                onChange={(e) => setBranch(i, { weight: Number(e.target.value) })}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            {data.branches.length > MIN_RANDOMIZER_BRANCHES && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  patch({ ...data, branches: data.branches.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {data.branches.length < MAX_RANDOMIZER_BRANCHES && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            patch({
              ...data,
              branches: [...data.branches, { label: "", weight: 0 }],
            })
          }
        >
          <Plus />
          Adicionar caminho
        </Button>
      )}

      <p
        className={
          total === RANDOMIZER_WEIGHT_TOTAL
            ? "text-xs text-muted-foreground"
            : "text-xs font-medium text-destructive"
        }
      >
        Soma atual: {total}%. As porcentagens precisam somar {RANDOMIZER_WEIGHT_TOTAL}%.
      </p>
      <p className="text-xs text-muted-foreground">
        De {MIN_RANDOMIZER_BRANCHES} a {MAX_RANDOMIZER_BRANCHES} caminhos. O
        fluxo sorteia um deles a cada pessoa que passa por aqui, proporcional
        ao peso de cada um.
      </p>
    </div>
  );
}
