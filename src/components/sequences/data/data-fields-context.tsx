"use client";

import { createContext, useContext, useId } from "react";

import { Input } from "@/components/ui/input";
import { FIELD_KEY_MAX, isValidFieldKey, toFieldKey } from "@/lib/sequences/fields";
import { cn } from "@/lib/utils";

/**
 * Campos que o fluxo grava (Coletar dado e Definir campo), para sugerir nos
 * formulários de Condição e Definir campo sem a pessoa redigitar o nome.
 */
const DataFieldsContext = createContext<string[]>([]);

export function DataFieldsProvider({
  fields,
  children,
}: {
  fields: string[];
  children: React.ReactNode;
}) {
  return (
    <DataFieldsContext.Provider value={fields}>{children}</DataFieldsContext.Provider>
  );
}

export function useDataFields(): string[] {
  return useContext(DataFieldsContext);
}

/** Input do nome do campo: normaliza enquanto digita e sugere os campos do fluxo. */
export function FieldKeyInput({
  id,
  value,
  onChange,
  placeholder = "ex.: email",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const fields = useDataFields();
  const listId = useId();
  const invalid = value.length > 0 && !isValidFieldKey(value);

  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        list={fields.length > 0 ? listId : undefined}
        placeholder={placeholder}
        className={cn("font-mono", invalid && "border-destructive")}
        maxLength={FIELD_KEY_MAX}
        value={value}
        onChange={(e) => onChange(toFieldKey(e.target.value))}
        autoComplete="off"
        spellCheck={false}
      />
      {fields.length > 0 && (
        <datalist id={listId}>
          {fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
      <p className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
        Minúsculas, números e _ (até {FIELD_KEY_MAX}). Use no texto como{" "}
        <code className="rounded bg-secondary px-1 font-mono text-[11px] text-foreground">
          {`{{${value || "campo"}}}`}
        </code>
        .
      </p>
    </div>
  );
}
