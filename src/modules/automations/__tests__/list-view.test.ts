import { describe, expect, it } from "vitest";

import type { ListAdapter, ListView } from "../types";
import {
  applyListView,
  DEFAULT_VIEW,
  folderKeyOf,
  hasViewParams,
  isFiltered,
  normalizeSearch,
  parseListView,
  sanitizeView,
  serializeListView,
  UNFILED,
  viewFolderCounts,
} from "../utils/list-view";

interface Item {
  id: string;
  name: string;
  keyword?: string | null;
  active: boolean;
  created: string;
  updated: string;
  runs: number;
  folder?: string | null;
  kind: "dm" | "comment";
  account: string;
}

const adapter: ListAdapter<Item> = {
  searchFields: (i) => [i.name, i.keyword],
  name: (i) => i.name,
  isActive: (i) => i.active,
  createdAt: (i) => i.created,
  updatedAt: (i) => i.updated,
  executions: (i) => i.runs,
  folderId: (i) => i.folder,
  kind: (i) => i.kind,
  accountId: (i) => i.account,
};

const items: Item[] = [
  {
    id: "a",
    name: "Preço do curso",
    keyword: "preço",
    active: true,
    created: "2026-10-01T10:00:00Z",
    updated: "2026-10-20T10:00:00Z",
    runs: 142,
    folder: "lanc",
    kind: "dm",
    account: "acc1",
  },
  {
    id: "b",
    name: "comentário reels março",
    keyword: null,
    active: false,
    created: "2026-10-12T10:00:00Z",
    updated: "2026-10-15T10:00:00Z",
    runs: 38,
    folder: null,
    kind: "comment",
    account: "acc2",
  },
  {
    id: "c",
    name: "Black Friday",
    keyword: "black",
    active: true,
    created: "2026-09-01T10:00:00Z",
    updated: "2026-10-18T10:00:00Z",
    runs: 142,
    folder: "pasta-apagada",
    kind: "dm",
    account: "acc1",
  },
];

const known = new Set(["lanc", "bf"]);
const view = (patch: Partial<ListView> = {}): ListView => ({ ...DEFAULT_VIEW, ...patch });
const ids = (list: Item[]) => list.map((i) => i.id);

describe("applyListView", () => {
  it("ordena por atualização mais recente por padrão", () => {
    expect(ids(applyListView(items, view(), adapter, known))).toEqual(["a", "c", "b"]);
  });

  it("ordena por criação, nome (pt-BR, sem caixa) e execuções", () => {
    expect(ids(applyListView(items, view({ sort: "created" }), adapter, known))).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(ids(applyListView(items, view({ sort: "name" }), adapter, known))).toEqual([
      "c",
      "b",
      "a",
    ]);
    // Empate em execuções: desempata pela atualização mais recente.
    expect(ids(applyListView(items, view({ sort: "executions" }), adapter, known))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("busca no nome e na palavra-chave ignorando acento e caixa", () => {
    expect(ids(applyListView(items, view({ q: "PRECO" }), adapter, known))).toEqual(["a"]);
    expect(ids(applyListView(items, view({ q: "black" }), adapter, known))).toEqual(["c"]);
    expect(ids(applyListView(items, view({ q: "  marco " }), adapter, known))).toEqual(["b"]);
    expect(applyListView(items, view({ q: "nada disso" }), adapter, known)).toEqual([]);
  });

  it("filtra status, tipo e conta", () => {
    expect(ids(applyListView(items, view({ status: "paused" }), adapter, known))).toEqual(["b"]);
    expect(ids(applyListView(items, view({ status: "active" }), adapter, known))).toEqual([
      "a",
      "c",
    ]);
    expect(ids(applyListView(items, view({ kind: "comment" }), adapter, known))).toEqual(["b"]);
    expect(ids(applyListView(items, view({ account: "acc1" }), adapter, known))).toEqual([
      "a",
      "c",
    ]);
  });

  it("pasta apagada conta como Sem pasta", () => {
    expect(ids(applyListView(items, view({ folder: UNFILED }), adapter, known))).toEqual([
      "c",
      "b",
    ]);
    expect(ids(applyListView(items, view({ folder: "lanc" }), adapter, known))).toEqual(["a"]);
  });

  it("ignora tipo e conta quando o adaptador não os tem (workflow)", () => {
    const { kind: _kind, accountId: _account, ...workflowAdapter } = adapter;
    const result = applyListView(
      items,
      view({ kind: "comment", account: "acc2" }),
      workflowAdapter,
      known
    );
    expect(result).toHaveLength(3);
  });

  it("não muda o array original", () => {
    const copy = [...items];
    applyListView(items, view({ sort: "name" }), adapter, known);
    expect(items).toEqual(copy);
  });
});

describe("viewFolderCounts", () => {
  const folders = [
    { id: "lanc", name: "Lançamento", color: "emerald" },
    { id: "bf", name: "Black Friday", color: "rose" },
  ];

  it("conta por pasta, inclusive as vazias, e põe pasta apagada em Sem pasta", () => {
    const counts = viewFolderCounts(items, view(), adapter, folders);
    expect(counts).toEqual({ byFolder: { lanc: 1, bf: 0 }, unfiled: 2, total: 3 });
  });

  it("aplica busca e filtros, mas não a pasta aberta", () => {
    const counts = viewFolderCounts(
      items,
      view({ status: "active", folder: "lanc" }),
      adapter,
      folders
    );
    expect(counts).toEqual({ byFolder: { lanc: 1, bf: 0 }, unfiled: 1, total: 2 });
  });
});

describe("URL da visão", () => {
  it("visão padrão não gera parâmetro nenhum", () => {
    expect(serializeListView(DEFAULT_VIEW)).toBe("");
  });

  it("ida e volta preserva todos os campos", () => {
    const original = view({
      q: "preço",
      status: "paused",
      sort: "executions",
      folder: "lanc",
      kind: "comment",
      account: "acc2",
    });
    const params = new URLSearchParams(serializeListView(original));
    expect(parseListView(params)).toEqual(original);
    expect(hasViewParams(params)).toBe(true);
  });

  it("Sem pasta vira sem-pasta na URL e volta como string vazia", () => {
    const qs = serializeListView(view({ folder: UNFILED }));
    expect(qs).toBe("pasta=sem-pasta");
    expect(parseListView(new URLSearchParams(qs)).folder).toBe(UNFILED);
  });

  it("valor desconhecido cai no padrão", () => {
    const parsed = parseListView(
      new URLSearchParams("status=talvez&ordem=aleatorio&tipo=story&pasta=")
    );
    expect(parsed).toEqual(DEFAULT_VIEW);
  });

  it("URL sem campo da visão não conta como visão", () => {
    expect(hasViewParams(new URLSearchParams("outra=1"))).toBe(false);
  });
});

describe("isFiltered e sanitizeView", () => {
  it("ordenação sozinha não é filtro", () => {
    expect(isFiltered(view({ sort: "name" }))).toBe(false);
    expect(isFiltered(view({ q: "  " }))).toBe(false);
    expect(isFiltered(view({ folder: UNFILED }))).toBe(true);
    expect(isFiltered(view({ status: "active" }))).toBe(true);
  });

  it("pasta ou conta que não existem mais voltam pra todas", () => {
    const accounts = new Set(["acc1"]);
    expect(
      sanitizeView(view({ folder: "sumiu", account: "acc9" }), {
        folderIds: known,
        accountIds: accounts,
      })
    ).toEqual(view());
    const ok = view({ folder: "lanc", account: "acc1" });
    expect(sanitizeView(ok, { folderIds: known, accountIds: accounts })).toBe(ok);
  });

  it("sem pastas (migration ausente), nem Sem pasta vale", () => {
    expect(sanitizeView(view({ folder: UNFILED }), { folderIds: new Set() }).folder).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizeSearch tira acento, caixa e espaço das pontas", () => {
    expect(normalizeSearch("  Lançamento ÇÃO ")).toBe("lancamento cao");
  });

  it("folderKeyOf", () => {
    expect(folderKeyOf("lanc", known)).toBe("lanc");
    expect(folderKeyOf("sumiu", known)).toBe(UNFILED);
    expect(folderKeyOf(null, known)).toBe(UNFILED);
    expect(folderKeyOf(undefined, known)).toBe(UNFILED);
  });
});
