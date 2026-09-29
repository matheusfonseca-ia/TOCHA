import { describe, expect, it } from "vitest";

import {
  FOLDER_COLORS,
  FOLDER_NAME_MAX,
  folderCounts,
  normalizeFolderName,
} from "@/lib/folders/folders";

describe("normalizeFolderName", () => {
  it("apara os espaços das pontas", () => {
    expect(normalizeFolderName("  Lançamento  ")).toEqual({
      name: "Lançamento",
    });
  });

  it("nome vazio não vira pasta", () => {
    expect(normalizeFolderName("   ")).toEqual({ error: expect.any(String) });
  });

  it("nome longo demais não vira pasta", () => {
    expect(normalizeFolderName("a".repeat(FOLDER_NAME_MAX + 1))).toEqual({
      error: expect.any(String),
    });
  });
});

describe("FOLDER_COLORS", () => {
  it("tem cores pra escolher e nenhuma repetida", () => {
    expect(FOLDER_COLORS.length).toBeGreaterThan(1);
    expect(new Set(FOLDER_COLORS).size).toBe(FOLDER_COLORS.length);
  });
});

describe("folderCounts", () => {
  const folders = [
    { id: "f1", name: "Lançamento", color: FOLDER_COLORS[0] },
    { id: "f2", name: "Perene", color: FOLDER_COLORS[1] },
  ];

  it("conta automações e workflows na mesma pasta, porque a pasta é compartilhada", () => {
    const counts = folderCounts(folders, [
      { folder_id: "f1" },
      { folder_id: "f1" },
      { folder_id: "f2" },
    ]);

    expect(counts.byFolder.f1).toBe(2);
    expect(counts.byFolder.f2).toBe(1);
  });

  it("conta separadamente o que não está em pasta nenhuma", () => {
    const counts = folderCounts(folders, [
      { folder_id: null },
      { folder_id: undefined },
      { folder_id: "f1" },
    ]);

    expect(counts.unfiled).toBe(2);
  });

  it("pasta sem nada dentro aparece com zero, não some da lista", () => {
    const counts = folderCounts(folders, [{ folder_id: "f1" }]);

    expect(counts.byFolder.f2).toBe(0);
  });

  it("item apontando pra pasta que não existe mais conta como sem pasta", () => {
    const counts = folderCounts(folders, [{ folder_id: "apagada" }]);

    expect(counts.unfiled).toBe(1);
    expect(counts.total).toBe(1);
  });
});
