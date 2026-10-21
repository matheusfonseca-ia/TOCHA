"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

import { generateForField } from "@/app/(dashboard)/rules/ai-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { cn } from "@/lib/utils";

/**
 * Janela do botão ✨. O campo já sabe o próprio limite e o próprio papel, então
 * a instrução é opcional: dá pra clicar em "Gerar" direto.
 *
 * É Dialog e não popover de propósito: esse botão também vive dentro dos cards
 * do canvas do Workflow, onde qualquer camada flutuante seria cortada.
 */
export function AiGenerateDialog({
  open,
  onOpenChange,
  field,
  context,
  onPick,
  onPickMany,
  primaryEmpty = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: AiFieldKind;
  context?: FieldPromptContext;
  /** Usar uma sugestão (substitui o conteúdo do campo). */
  onPick: (text: string) => void;
  /**
   * Só nos campos com variantes: as sugestões viram itens marcáveis e o botão
   * principal manda as marcadas pras variações (quem chama aplica a regra e
   * avisa se algo ficou de fora).
   */
  onPickMany?: (texts: string[]) => void;
  /** Texto principal do campo ainda vazio: a 1ª marcada vai virar o principal. */
  primaryEmpty?: boolean;
}) {
  const spec = aiFieldSpec(field);
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Posições (em `suggestions`) marcadas; só usado quando há `onPickMany`. */
  const [selected, setSelected] = useState<number[]>([]);

  const count = onPickMany ? 5 : 3;
  const allSelected = suggestions.length > 0 && selected.length === suggestions.length;

  async function generate() {
    setLoading(true);
    setError(null);
    setSelected([]);
    const result = await generateForField({ field, count, instruction, context });
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      setSuggestions([]);
      return;
    }
    setSuggestions(result.suggestions);
  }

  function toggle(index: number) {
    setSelected((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index]
    );
  }

  function toggleAll() {
    setSelected(allSelected ? [] : suggestions.map((_, i) => i));
  }

  function addSelected() {
    // Na ordem em que aparecem, não na ordem dos cliques: a 1ª da lista é a
    // que vira o texto principal.
    const texts = [...selected].sort((a, b) => a - b).map((i) => suggestions[i]);
    if (texts.length === 0) return;
    onPickMany?.(texts);
    close(false);
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSelected([]);
      setSuggestions([]);
      setError(null);
      setInstruction("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Escrever com IA</DialogTitle>
          <DialogDescription>
            {spec.label} · até {spec.maxChars} caracteres. A instrução é
            opcional.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            value={instruction}
            placeholder="ex.: mais informal, fala de black friday"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                e.preventDefault();
                void generate();
              }
            }}
          />
          <Button type="button" onClick={() => void generate()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {suggestions.length ? "De novo" : "Gerar"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {suggestions.length > 0 && !onPickMany && (
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  onPick(suggestion);
                  close(false);
                }}
                className="w-full rounded-md border border-border/70 bg-secondary/20 px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-secondary/50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && onPickMany && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {primaryEmpty
                  ? "Marque as que quiser. A primeira marcada vira o texto principal e as outras viram variações."
                  : "Marque as que quiser. Elas entram como variações novas."}
              </p>
              <button
                type="button"
                onClick={toggleAll}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? "Limpar seleção" : "Selecionar todas"}
              </button>
            </div>

            <div role="group" aria-label="Sugestões" className="space-y-2">
              {suggestions.map((suggestion, index) => {
                const checked = selected.includes(index);
                return (
                  <button
                    key={`${index}-${suggestion}`}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(index)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border/70 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/50"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">{suggestion}</span>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={selected.length === 0}
              onClick={addSelected}
            >
              {selected.length === 0
                ? "Marque as sugestões que quer usar"
                : `Adicionar ${selected.length} às variações`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
