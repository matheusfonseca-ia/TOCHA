import type { Rule } from "@/types/database";
import type { Sequence } from "@/types/sequence";

export type RuleWithAccount = Rule & {
  ig_accounts: { ig_username: string } | null;
};

export type SequenceWithAccount = Sequence & {
  ig_accounts: { ig_username: string } | null;
};

export interface SequenceStats {
  /** Total de pessoas que já entraram no fluxo. */
  total: number;
  /** Pessoas paradas em algum nó de espera agora. */
  inFlow: number;
}

export interface AccountOption {
  id: string;
  ig_username: string;
}

/** Contagens das abas do topo (Automações e Workflow). */
export interface AutomationCounts {
  rules: number;
  sequences: number;
}

export type StatusFilter = "all" | "active" | "paused";
export type SortKey = "updated" | "created" | "name" | "executions";
/** Só na aba Automações: regra de DM ou de comentário. */
export type KindFilter = "all" | "dm" | "comment";

/**
 * Visão da lista (busca, filtros, ordenação e pasta). Vai pra URL, então
 * voltar do editor mantém o que a pessoa estava olhando.
 */
export interface ListView {
  q: string;
  status: StatusFilter;
  sort: SortKey;
  /** null = todas; "" = sem pasta; id = a pasta. */
  folder: string | null;
  kind: KindFilter;
  /** "all" ou o id da conta. */
  account: string;
}

/** Como ler de um item (automação ou workflow) o que a visão precisa. */
export interface ListAdapter<T> {
  searchFields: (item: T) => Array<string | null | undefined>;
  name: (item: T) => string;
  isActive: (item: T) => boolean;
  createdAt: (item: T) => string;
  updatedAt: (item: T) => string;
  executions: (item: T) => number;
  folderId: (item: T) => string | null | undefined;
  kind?: (item: T) => Exclude<KindFilter, "all">;
  accountId?: (item: T) => string;
}
