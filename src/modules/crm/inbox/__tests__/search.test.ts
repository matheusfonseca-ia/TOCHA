import { describe, expect, it } from "vitest";

import { sanitizeSearch, searchFilter } from "../services/inbox.queries";

describe("busca livre do Inbox", () => {
  it("escapa o curinga _ e tira aspas e o que quebra o filtro or", () => {
    expect(sanitizeSearch("joao_silva")).toBe("joao\\\\_silva");
    expect(sanitizeSearch('a"b')).toBe("a b");
    expect(sanitizeSearch("50% (off), *x*\\")).toBe("50   off    x");
  });

  it("monta o filtro com os valores entre aspas", () => {
    expect(searchFilter("ana.paula")).toBe(
      'ig_sender_username.ilike."%ana.paula%",last_message_text.ilike."%ana.paula%"'
    );
    expect(searchFilter("   ")).toBeNull();
  });
});
