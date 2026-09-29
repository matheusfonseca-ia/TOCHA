"use client";

import { createContext, useContext, useId } from "react";

import { Input } from "@/components/ui/input";
import { TAG_MAX } from "@/lib/sequences/fields";

/**
 * Catálogo de tags da conta (CRM, migration 0012), para sugerir nos
 * formulários "Definir campo ou tag" (modo tag) e "Condição" (operador "tem a
 * tag") sem a pessoa redigitar o nome. Texto livre continua aceito.
 */
const TagsCatalogContext = createContext<string[]>([]);

export function TagsCatalogProvider({
  tags,
  children,
}: {
  tags: string[];
  children: React.ReactNode;
}) {
  return <TagsCatalogContext.Provider value={tags}>{children}</TagsCatalogContext.Provider>;
}

export function useTagsCatalog(): string[] {
  return useContext(TagsCatalogContext);
}

/** Input de nome de tag: texto livre, com sugestões do catálogo da conta. */
export function TagNameInput({
  id,
  value,
  onChange,
  placeholder = "ex.: vip",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const tags = useTagsCatalog();
  const listId = useId();

  return (
    <>
      <Input
        id={id}
        list={tags.length > 0 ? listId : undefined}
        placeholder={placeholder}
        maxLength={TAG_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {tags.length > 0 && (
        <datalist id={listId}>
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
    </>
  );
}
