"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

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
  onPickAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: AiFieldKind;
  context?: FieldPromptContext;
  /** Usar uma sugestão (substitui o conteúdo do campo). */
  onPick: (text: string) => void;
  /** Só nos campos com variantes: cadastrar todas de uma vez. */
  onPickAll?: (texts: string[]) => void;
}) {
  const spec = aiFieldSpec(field);
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const count = onPickAll ? 5 : 3;

  async function generate() {
    setLoading(true);
    setError(null);
    const result = await generateForField({ field, count, instruction, context });
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      setSuggestions([]);
      return;
    }
    setSuggestions(result.suggestions);
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
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

        {suggestions.length > 0 && (
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

            {onPickAll && suggestions.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onPickAll(suggestions);
                  close(false);
                }}
              >
                Cadastrar as {suggestions.length} como variantes
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
