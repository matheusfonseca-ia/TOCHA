"use client";

import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addVariant, allVariants } from "@/lib/rules/variants";
import { cn } from "@/lib/utils";

const MAX_VARIANTS = 10;

interface VariantListProps {
  /** Prefixo único para os `id` dos campos (ex.: "welcome", "public-reply"). */
  idPrefix: string;
  /** Texto da variante 1 (os campos `welcome_text`/`public_reply_text` da regra). */
  primary: string;
  onPrimaryChange: (value: string) => void;
  /** Variantes extras (2ª em diante). */
  extras: string[];
  onExtrasChange: (extras: string[]) => void;
  maxLength: number;
  placeholder?: string;
  rows?: number;
  /** Textos prontos que o usuário cadastra como variante com um clique. */
  presets?: readonly string[];
}

/**
 * Lista de variantes de um texto de resposta: a variante 1 é sempre exibida,
 * e o usuário pode adicionar até `MAX_VARIANTS - 1` variantes extras. O
 * Falow sorteia uma delas a cada disparo (ver `src/lib/rules/variants.ts`).
 *
 * Reaproveitado tanto pela resposta pública do comentário quanto pela
 * mensagem privada de boas-vindas em `responder-comentario-builder.tsx`.
 */
export function VariantList({
  idPrefix,
  primary,
  onPrimaryChange,
  extras,
  onExtrasChange,
  maxLength,
  placeholder,
  rows = 3,
  presets,
}: VariantListProps) {
  const canAddMore = extras.length + 1 < MAX_VARIANTS;
  const current = allVariants(primary, extras);
  const hasRoomForPreset =
    !primary.trim() || extras.some((extra) => !extra.trim()) || canAddMore;
  const unusedPresets = (presets ?? []).filter((p) => !current.includes(p));

  function addEmptyVariant() {
    if (!canAddMore) return;
    onExtrasChange([...extras, ""]);
  }

  function applyPresets(texts: readonly string[]) {
    const next = texts.reduce(
      (acc, text) => addVariant(acc.primary, acc.extras, text, MAX_VARIANTS),
      { primary, extras }
    );
    if (next.primary !== primary) onPrimaryChange(next.primary);
    if (next.extras !== extras) onExtrasChange(next.extras);
  }

  function updateVariant(index: number, value: string) {
    onExtrasChange(extras.map((v, i) => (i === index ? value : v)));
  }

  function removeVariant(index: number) {
    onExtrasChange(extras.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {extras.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">
            Variante 1
          </p>
        )}
        <Textarea
          id={idPrefix}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          value={primary}
          onChange={(e) => onPrimaryChange(e.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground">
          {primary.length}/{maxLength}
        </p>
      </div>

      {extras.map((extra, index) => (
        <div key={index} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Variante {index + 2}
            </p>
            <button
              type="button"
              onClick={() => removeVariant(index)}
              aria-label={`Remover variante ${index + 2}`}
              className="text-muted-foreground/70 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <Textarea
            id={`${idPrefix}-variant-${index}`}
            placeholder={placeholder}
            rows={rows}
            maxLength={maxLength}
            value={extra}
            onChange={(e) => updateVariant(index, e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {extra.length}/{maxLength}
          </p>
        </div>
      ))}

      {canAddMore && (
        <Button type="button" variant="outline" size="sm" onClick={addEmptyVariant}>
          <Plus className="h-4 w-4" />
          Adicionar variante
        </Button>
      )}

      {presets && presets.length > 0 && (
        <div className="space-y-2 rounded-md border border-border/70 bg-secondary/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Respostas prontas
            </p>
            {hasRoomForPreset && unusedPresets.length > 1 && (
              <button
                type="button"
                onClick={() => applyPresets(unusedPresets)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Adicionar todas
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => {
              const used = current.includes(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={used}
                  disabled={used || !hasRoomForPreset}
                  onClick={() => applyPresets([preset])}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-left text-xs font-medium transition-colors",
                    used
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 bg-secondary/30 text-muted-foreground enabled:hover:bg-secondary/60 enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {used && <Check className="h-3 w-3 shrink-0" />}
                  {preset}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        O Falow sorteia uma variante a cada disparo, para as respostas não
        ficarem todas iguais.
      </p>
    </div>
  );
}
