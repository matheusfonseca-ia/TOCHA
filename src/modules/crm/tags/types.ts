/**
 * Catálogo de tags do CRM (migration 0012). `contacts.tags` (migration 0004)
 * continua sendo a fonte de verdade lida pelo runtime do workflow; este
 * catálogo só serve a UI (ficha do lead, filtro da lista, gerenciador).
 */

export const TAG_COLORS = [
  "green",
  "blue",
  "purple",
  "pink",
  "orange",
  "amber",
  "cyan",
  "red",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export interface CrmTag {
  id: string;
  account_id: string;
  name: string;
  color: TagColor;
  created_at: string;
}

/** Quantos workflows (setField em modo tag ou condição "tem a tag") usam uma tag. */
export interface TagWorkflowUsage {
  count: number;
  sequenceNames: string[];
}
