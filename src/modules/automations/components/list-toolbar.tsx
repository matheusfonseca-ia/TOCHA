"use client";

import { ArrowDownUp, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  AccountOption,
  KindFilter,
  ListView,
  SortKey,
  StatusFilter,
} from "../types";
import { isFiltered, type SortConfig } from "../utils/list-view";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "priority", label: "Prioridade (ordem de avaliação)" },
  { value: "updated", label: "Atualizado recentemente" },
  { value: "created", label: "Criado recentemente" },
  { value: "name", label: "Nome A a Z" },
  { value: "executions", label: "Mais execuções" },
];

const STATUS_OPTIONS: Record<"f" | "m", { value: StatusFilter; label: string }[]> = {
  f: [
    { value: "all", label: "Todas" },
    { value: "active", label: "Ativas" },
    { value: "paused", label: "Pausadas" },
  ],
  m: [
    { value: "all", label: "Todos" },
    { value: "active", label: "Ativos" },
    { value: "paused", label: "Pausados" },
  ],
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "dm", label: "DM" },
  { value: "comment", label: "Comentário" },
];

/**
 * Busca, filtros e ordenação das listas de Automação. Os filtros de tipo e de
 * conta só aparecem na aba Automações (e o de conta só com mais de uma conta).
 */
export function ListToolbar({
  view,
  onChange,
  onReset,
  searchPlaceholder,
  gender,
  sorts,
  showKind = false,
  accounts = [],
  trailing,
}: {
  view: ListView;
  onChange: (patch: Partial<ListView>) => void;
  onReset: () => void;
  searchPlaceholder: string;
  /** Concordância dos rótulos de status: automação (f) ou workflow (m). */
  gender: "f" | "m";
  /** Ordenações oferecidas por esta lista. */
  sorts: SortConfig;
  showKind?: boolean;
  accounts?: AccountOption[];
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <Input
          type="search"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          className="pl-8"
          value={view.q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        <FilterSelect
          label="Status"
          value={view.status}
          options={STATUS_OPTIONS[gender]}
          onChange={(status) => onChange({ status })}
        />
        {showKind && (
          <FilterSelect
            label="Tipo"
            value={view.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => onChange({ kind })}
          />
        )}
        {accounts.length > 1 && (
          <FilterSelect
            label="Conta"
            value={view.account}
            options={[
              { value: "all", label: "Todas" },
              ...accounts.map((a) => ({ value: a.id, label: `@${a.ig_username}` })),
            ]}
            onChange={(account) => onChange({ account })}
          />
        )}
        <FilterSelect
          icon={<ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Ordenar"
          value={view.sort}
          options={SORT_OPTIONS.filter((o) => sorts.allowed.includes(o.value))}
          onChange={(sort) => onChange({ sort })}
        />
        {isFiltered(view) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={onReset}
          >
            <X />
            Limpar filtros
          </Button>
        )}
        {trailing && <div className="shrink-0 sm:ml-auto">{trailing}</div>}
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  icon?: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className="w-auto shrink-0 gap-1.5 whitespace-nowrap">
        {icon ?? <span className="text-muted-foreground">{label}:</span>}
        {icon && <span className="sr-only">{label}:</span>}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
