import { describe, expect, it } from "vitest";

import { contactFieldKeys, contactsToCsv, csvCell } from "@/lib/contacts/csv";

describe("csvCell", () => {
  it("mantém valor simples", () => {
    expect(csvCell("ana@x.com")).toBe("ana@x.com");
  });
  it("coloca entre aspas quando tem separador, aspas ou quebra de linha", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });
  it("neutraliza fórmula, mas deixa telefone e número negativo", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+5511987654321")).toBe("+5511987654321");
    expect(csvCell("-3")).toBe("-3");
  });
});

describe("contactsToCsv", () => {
  const base = {
    ig_username: null,
    tags: [] as string[],
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
  };

  it("uma coluna por campo (união, ordem alfabética), com BOM e ';'", () => {
    const csv = contactsToCsv([
      { ...base, ig_sender_id: "1", ig_username: "ana", fields: { email: "a@x.com" }, tags: ["vip", "lead"], account_username: "loja" },
      { ...base, ig_sender_id: "2", fields: { cidade: "Rio" } },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("username;ig_sender_id;conta;cidade;email;tags;criado_em;atualizado_em");
    expect(lines[1]).toBe("ana;1;loja;;a@x.com;vip, lead;2026-09-01T10:00:00Z;2026-09-02T10:00:00Z");
    expect(lines[2]).toBe(";2;;Rio;;;2026-09-01T10:00:00Z;2026-09-02T10:00:00Z");
  });

  it("contactFieldKeys ignora fields ausente", () => {
    expect(contactFieldKeys([{ fields: { b: "1" } }, { fields: undefined as never }, { fields: { a: "2" } }])).toEqual(["a", "b"]);
  });
});
