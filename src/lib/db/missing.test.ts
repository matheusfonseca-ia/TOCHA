import { describe, expect, it } from "vitest";

import { isMissingColumn, isMissingTable } from "@/lib/db/missing";

/**
 * Payloads reais do PostgREST, colhidos batendo num projeto Supabase que
 * ainda não tinha as migrations aplicadas.
 */
const tabelaAusente = {
  code: "PGRST205",
  message:
    "Could not find the table 'public.message_presets' in the schema cache",
};
const colunaAusente = {
  code: "42703",
  message: "column rules.folder_id does not exist",
};

describe("isMissingTable", () => {
  it("reconhece a tabela que ainda não existe", () => {
    expect(isMissingTable(tabelaAusente, "message_presets")).toBe(true);
  });

  it("não confunde com outra tabela ausente", () => {
    expect(isMissingTable(tabelaAusente, "folders")).toBe(false);
  });

  it("erro de outra natureza não vira 'falta migration'", () => {
    expect(
      isMissingTable({ code: "23505", message: "duplicate key" }, "message_presets")
    ).toBe(false);
  });

  it("sem erro nenhum é falso", () => {
    expect(isMissingTable(null, "message_presets")).toBe(false);
    expect(isMissingTable(undefined, "message_presets")).toBe(false);
  });
});

describe("isMissingColumn", () => {
  it("reconhece a coluna que ainda não existe", () => {
    expect(isMissingColumn(colunaAusente, "folder_id")).toBe(true);
  });

  it("não confunde com outra coluna", () => {
    expect(isMissingColumn(colunaAusente, "follow_gate_enabled")).toBe(false);
  });

  it("também pega a variante que o PostgREST devolve pelo schema cache", () => {
    expect(
      isMissingColumn(
        {
          code: "PGRST204",
          message: "Could not find the 'folder_id' column of 'rules' in the schema cache",
        },
        "folder_id"
      )
    ).toBe(true);
  });

  it("sem erro nenhum é falso", () => {
    expect(isMissingColumn(null, "folder_id")).toBe(false);
  });
});
