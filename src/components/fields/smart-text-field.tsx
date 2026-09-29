"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkPlus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deletePreset,
  savePreset,
} from "@/app/(dashboard)/rules/presets-actions";
import { AiGenerateDialog } from "@/components/fields/ai-generate-dialog";
import { useSmartFields } from "@/components/fields/smart-fields-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { aiFieldSpec, type AiFieldKind } from "@/lib/ai/fields";
import type { FieldPromptContext } from "@/lib/ai/prompt";
import { presetsForField, type MessagePreset } from "@/lib/presets/presets";
import { cn } from "@/lib/utils";

/**
 * Campo de texto com os dois atalhos no canto: 📌 textos salvos e ✨ escrever
 * com IA. É o mesmo componente em todo lugar (automação, portão, workflow),
 * porque o que muda entre um campo e outro é só o `field` — dele saem o
 * limite, o papel no prompt e quais presets aparecem primeiro.
 *
 * Os dois botões somem sozinhos quando não têm o que oferecer: sem
 * OPENROUTER_API_KEY não tem ✨, sem a migration 0009 não tem 📌.
 */
export interface SmartTextFieldProps {
  id?: string;
  field: AiFieldKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Some se não vier: a conta é necessária pra salvar um texto novo. */
  accountId?: string | null;
  /** Sobrescreve o contexto do layout (usado em teste e em telas isoladas). */
  presets?: MessagePreset[];
  aiEnabled?: boolean;
  context?: FieldPromptContext;
  /** Só onde existe lista de variantes: "cadastrar as 5 de uma vez". */
  onGenerateMany?: (texts: string[]) => void;
  /** Esconde o contador (quem já mostra o próprio). */
  hideCounter?: boolean;
}

export function SmartTextField({
  id,
  field,
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  accountId,
  presets,
  aiEnabled,
  context,
  onGenerateMany,
  hideCounter,
}: SmartTextFieldProps) {
  const fromLayout = useSmartFields();
  const allPresets = presets ?? fromLayout.presets;
  const canUseAi = aiEnabled ?? fromLayout.aiEnabled;
  const { maxChars } = aiFieldSpec(field);
  const [aiOpen, setAiOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const available = presetsForField(allPresets, field);
  const canSave = Boolean(accountId) && value.trim().length > 0;
  const showPresets = available.length > 0 || canSave;

  function handleSave() {
    if (!accountId) return;
    startTransition(async () => {
      const result = await savePreset({ accountId, scope: field, text: value });
      if ("error" in result) toast.error(result.error);
      else toast.success("Texto salvo.");
    });
  }

  function handleDelete(presetId: string) {
    startTransition(async () => {
      const result = await deletePreset(presetId);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          maxLength={maxChars}
          onChange={(e) => onChange(e.target.value)}
          className={cn(showPresets || canUseAi ? "pr-16" : undefined, className)}
        />

        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          {showPresets && (
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                aria-label="Textos salvos"
                disabled={isPending}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <Bookmark className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-xs">
                {available.length > 0 && (
                  <>
                    <DropdownMenuLabel>Textos salvos</DropdownMenuLabel>
                    {available.map((preset) => (
                      <DropdownMenuItem
                        key={preset.id}
                        onSelect={() => onChange(preset.text)}
                        className="group"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {preset.label}
                        </span>
                        <button
                          type="button"
                          aria-label={`Apagar ${preset.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(preset.id);
                          }}
                          className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {available.length > 0 && canSave && <DropdownMenuSeparator />}
                {canSave && (
                  <DropdownMenuItem onSelect={handleSave}>
                    <BookmarkPlus className="h-4 w-4" />
                    Salvar este texto
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canUseAi && (
            <button
              type="button"
              aria-label="Escrever com IA"
              onClick={() => setAiOpen(true)}
              className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!hideCounter && (
        <p className="text-right text-xs text-muted-foreground">
          {value.length}/{maxChars}
        </p>
      )}

      {canUseAi && (
        <AiGenerateDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          field={field}
          context={context}
          onPick={onChange}
          onPickAll={onGenerateMany}
        />
      )}
    </div>
  );
}
