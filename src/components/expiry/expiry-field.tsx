"use client";

import { useId } from "react";
import { Timer } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  MIN_EXPIRY_LEAD_MS,
  resolveExpiryForm,
  toDatetimeLocal,
  type ExpireAction,
  type ExpiryFormValue,
  type ExpiryMode,
} from "@/lib/expiry/expiry";
import { cn } from "@/lib/utils";

const MODES: { value: ExpiryMode; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "3d", label: "3 dias" },
  { value: "7d", label: "7 dias" },
  { value: "custom", label: "Data e hora" },
];

/**
 * Bloco "Automação temporária": switch + presets + data e hora + ação ao
 * expirar. Controlado: quem usa guarda o `ExpiryFormValue` e converte com
 * `resolveExpiryForm` na hora de salvar.
 */
export function ExpiryField({
  value,
  onChange,
  label = "Automação temporária",
  description = "Ela se apaga ou pausa sozinha na data escolhida.",
  className,
  usedInWorkflows,
}: {
  value: ExpiryFormValue;
  onChange: (next: ExpiryFormValue) => void;
  label?: string;
  description?: string;
  className?: string;
  /** Workflows que usam esta automação: avisa antes de escolher "Excluir". */
  usedInWorkflows?: string[];
}) {
  const id = useId();
  const patch = (partial: Partial<ExpiryFormValue>) =>
    onChange({ ...value, ...partial });

  const resolved = value.enabled ? resolveExpiryForm(value) : null;

  function selectMode(mode: ExpiryMode) {
    // Ao abrir "Data e hora" sem valor, sugere daqui a 24 h para o input não nascer vazio.
    if (mode === "custom" && !value.customLocal) {
      patch({ mode, customLocal: toDatetimeLocal(Date.now() + 24 * 60 * 60 * 1000) });
      return;
    }
    patch({ mode });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor={`${id}-switch`} className="flex items-center gap-1.5 text-sm">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch
          id={`${id}-switch`}
          checked={value.enabled}
          onCheckedChange={(checked) => patch({ enabled: checked })}
        />
      </div>

      {value.enabled && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Expira em
            </Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup">
              {MODES.map((mode) => {
                const active = value.mode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectMode(mode.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border/70 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
            {value.mode === "custom" && (
              <Input
                type="datetime-local"
                aria-label="Data e hora da expiração"
                className="w-full sm:w-64"
                min={toDatetimeLocal(Date.now() + MIN_EXPIRY_LEAD_MS)}
                value={value.customLocal}
                onChange={(e) => patch({ customLocal: e.target.value })}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${id}-action`} className="text-xs font-medium text-muted-foreground">
              Ao expirar
            </Label>
            <Select
              value={value.action}
              onValueChange={(v) => patch({ action: v as ExpireAction })}
            >
              <SelectTrigger id={`${id}-action`} className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delete">Excluir</SelectItem>
                <SelectItem value="pause">Pausar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.action === "delete" && usedInWorkflows && usedInWorkflows.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="font-medium text-foreground">
                Usada em {usedInWorkflows.length}{" "}
                {usedInWorkflows.length === 1 ? "workflow" : "workflows"}:{" "}
                {usedInWorkflows.join(", ")}.
              </p>
              <p className="mt-1 text-muted-foreground">
                Se ela for excluída ao expirar, esses fluxos param no bloco dela.
                Com &ldquo;Pausar&rdquo;, ela deixa de disparar sozinha, mas o
                bloco dela continua funcionando no meio dos fluxos.
              </p>
            </div>
          )}

          {resolved && (
            <p
              className={cn(
                "text-xs",
                resolved.error ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {resolved.error ??
                `${value.action === "delete" ? "Exclusão automática" : "Pausa automática"} em ${new Date(
                  resolved.expires_at!
                ).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${
                  value.mode === "custom" ? "" : " (contando a partir de quando você salvar)"
                }.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
