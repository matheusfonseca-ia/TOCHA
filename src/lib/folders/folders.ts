/**
 * Pastas de organização. Um nível só (sem pasta dentro de pasta) e
 * COMPARTILHADAS entre Automações e Workflow: a pasta "Lançamento de março"
 * guarda as duas coisas, porque pra quem usa isso é um sistema só.
 *
 * Apagar pasta não apaga o que está dentro — os itens voltam pra "Sem pasta"
 * (o `on delete set null` da migration cuida disso).
 */

export const FOLDER_NAME_MAX = 40;

/** Cores disponíveis pro ponto colorido da pasta. */
export const FOLDER_COLORS = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

export type FolderColor = (typeof FOLDER_COLORS)[number];

export interface Folder {
  id: string;
  name: string;
  color: string;
}

/** O que basta saber de um item (automação ou workflow) pra contar. */
export interface FiledItem {
  folder_id?: string | null;
}

export function normalizeFolderName(
  raw: string
): { name: string } | { error: string } {
  const name = raw.trim();
  if (!name) return { error: "Dê um nome pra pasta." };
  if (name.length > FOLDER_NAME_MAX) {
    return { error: `Nome muito longo: máximo de ${FOLDER_NAME_MAX} caracteres.` };
  }
  return { name };
}

export interface FolderCounts {
  /** Quantos itens em cada pasta, incluindo as vazias (zero). */
  byFolder: Record<string, number>;
  /** Itens sem pasta, ou apontando pra uma pasta que não existe mais. */
  unfiled: number;
  total: number;
}

export function folderCounts(
  folders: Folder[],
  items: FiledItem[]
): FolderCounts {
  const byFolder: Record<string, number> = {};
  for (const folder of folders) byFolder[folder.id] = 0;

  let unfiled = 0;
  for (const item of items) {
    const id = item.folder_id;
    if (id && id in byFolder) byFolder[id] += 1;
    else unfiled += 1;
  }

  return { byFolder, unfiled, total: items.length };
}
