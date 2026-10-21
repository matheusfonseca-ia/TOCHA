import { folderCounts, type Folder, type FolderCounts } from "@/lib/folders/folders";

import type {
  KindFilter,
  ListAdapter,
  ListView,
  SortKey,
  StatusFilter,
} from "../types";

/** Valor de `ListView.folder` para "Sem pasta". */
export const UNFILED = "";

export const DEFAULT_VIEW: ListView = {
  q: "",
  status: "all",
  sort: "updated",
  folder: null,
  kind: "all",
  account: "all",
};

const STATUS_VALUES: StatusFilter[] = ["all", "active", "paused"];
const SORT_VALUES: SortKey[] = ["updated", "created", "name", "executions"];
const KIND_VALUES: KindFilter[] = ["all", "dm", "comment"];

/** Nome do parâmetro de URL de cada campo da visão. */
const PARAM = {
  q: "q",
  status: "status",
  sort: "ordem",
  folder: "pasta",
  kind: "tipo",
  account: "conta",
} as const;

/** "sem-pasta" na URL fica legível; internamente é a string vazia. */
const UNFILED_PARAM = "sem-pasta";

interface ParamReader {
  get(name: string): string | null;
}

function oneOf<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return value !== null && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

/** Lê a visão da URL. Valor desconhecido cai no padrão em vez de quebrar a tela. */
export function parseListView(params: ParamReader): ListView {
  const folder = params.get(PARAM.folder);
  return {
    q: params.get(PARAM.q) ?? DEFAULT_VIEW.q,
    status: oneOf(params.get(PARAM.status), STATUS_VALUES, DEFAULT_VIEW.status),
    sort: oneOf(params.get(PARAM.sort), SORT_VALUES, DEFAULT_VIEW.sort),
    folder: folder === null || folder === "" ? null : folder === UNFILED_PARAM ? UNFILED : folder,
    kind: oneOf(params.get(PARAM.kind), KIND_VALUES, DEFAULT_VIEW.kind),
    account: params.get(PARAM.account) || DEFAULT_VIEW.account,
  };
}

/** Só grava o que difere do padrão, pra URL limpa quando nada foi mexido. */
export function serializeListView(view: ListView): string {
  const params = new URLSearchParams();
  if (view.q.trim()) params.set(PARAM.q, view.q);
  if (view.status !== DEFAULT_VIEW.status) params.set(PARAM.status, view.status);
  if (view.sort !== DEFAULT_VIEW.sort) params.set(PARAM.sort, view.sort);
  if (view.folder !== null) {
    params.set(PARAM.folder, view.folder === UNFILED ? UNFILED_PARAM : view.folder);
  }
  if (view.kind !== DEFAULT_VIEW.kind) params.set(PARAM.kind, view.kind);
  if (view.account !== DEFAULT_VIEW.account) params.set(PARAM.account, view.account);
  return params.toString();
}

/** A URL traz algum campo da visão? (sem nada, vale a última visão da sessão) */
export function hasViewParams(params: ParamReader): boolean {
  return Object.values(PARAM).some((name) => params.get(name) !== null);
}

/** Algum filtro ligado (a ordenação não conta: não esconde nada). */
export function isFiltered(view: ListView): boolean {
  return (
    view.q.trim() !== "" ||
    view.status !== DEFAULT_VIEW.status ||
    view.folder !== null ||
    view.kind !== DEFAULT_VIEW.kind ||
    view.account !== DEFAULT_VIEW.account
  );
}

/**
 * URL velha (pasta apagada, conta desconectada) ou banco sem pastas: o que
 * não existe mais cai em "todas" em vez de esvaziar a lista sem explicação.
 */
export function sanitizeView(
  view: ListView,
  known: { folderIds: ReadonlySet<string>; accountIds?: ReadonlySet<string> }
): ListView {
  const folderOk =
    view.folder === null ||
    (known.folderIds.size > 0 && (view.folder === UNFILED || known.folderIds.has(view.folder)));
  const accountOk =
    view.account === DEFAULT_VIEW.account || (known.accountIds?.has(view.account) ?? false);
  if (folderOk && accountOk) return view;
  return {
    ...view,
    folder: folderOk ? view.folder : null,
    account: accountOk ? view.account : DEFAULT_VIEW.account,
  };
}

/** Minúsculas e sem acento: "preco" acha "Preço". */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Pasta efetiva do item: apontar pra pasta que não existe mais conta como "Sem pasta". */
export function folderKeyOf(
  folderId: string | null | undefined,
  knownFolderIds: ReadonlySet<string>
): string {
  return folderId && knownFolderIds.has(folderId) ? folderId : UNFILED;
}

const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function time(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

function compareBy<T>(sort: SortKey, adapter: ListAdapter<T>) {
  const byUpdated = (a: T, b: T) => time(adapter.updatedAt(b)) - time(adapter.updatedAt(a));
  switch (sort) {
    case "created":
      return (a: T, b: T) => time(adapter.createdAt(b)) - time(adapter.createdAt(a));
    case "name":
      return (a: T, b: T) => nameCollator.compare(adapter.name(a), adapter.name(b));
    case "executions":
      return (a: T, b: T) =>
        adapter.executions(b) - adapter.executions(a) || byUpdated(a, b);
    default:
      return byUpdated;
  }
}

/**
 * Aplica busca, filtros, pasta e ordenação. Não muda o array original e o
 * empate mantém a ordem que veio do servidor.
 */
export function applyListView<T>(
  items: readonly T[],
  view: ListView,
  adapter: ListAdapter<T>,
  knownFolderIds: ReadonlySet<string>
): T[] {
  const q = normalizeSearch(view.q);
  const filtered = items.filter((item) => {
    if (q && !adapter.searchFields(item).some((v) => v && normalizeSearch(v).includes(q))) {
      return false;
    }
    if (view.status === "active" && !adapter.isActive(item)) return false;
    if (view.status === "paused" && adapter.isActive(item)) return false;
    if (view.kind !== "all" && adapter.kind && adapter.kind(item) !== view.kind) return false;
    if (view.account !== "all" && adapter.accountId && adapter.accountId(item) !== view.account) {
      return false;
    }
    if (view.folder !== null && folderKeyOf(adapter.folderId(item), knownFolderIds) !== view.folder) {
      return false;
    }
    return true;
  });

  const compare = compareBy(view.sort, adapter);
  return filtered
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Contagem dos cartões de pasta com a busca e os filtros atuais aplicados
 * (menos a própria pasta): o número diz quantos resultados há em cada uma.
 */
export function viewFolderCounts<T>(
  items: readonly T[],
  view: ListView,
  adapter: ListAdapter<T>,
  folders: Folder[]
): FolderCounts {
  const known = new Set(folders.map((f) => f.id));
  const visible = applyListView(items, { ...view, folder: null }, adapter, known);
  return folderCounts(
    folders,
    visible.map((item) => ({ folder_id: adapter.folderId(item) }))
  );
}
