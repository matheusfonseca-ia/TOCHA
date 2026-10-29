import { describe, expect, it } from "vitest";

import { contactSearchText, matchesTerms, searchTerms } from "@/lib/contacts/search";

describe("busca de contatos", () => {
  const contact = {
    ig_username: "Joana",
    ig_sender_id: "123",
    fields: { cidade: "São Paulo" },
    tags: ["VIP"],
    ig_accounts: { ig_username: "loja" },
  };

  it("acha por @, campo e tag sem maiúscula/acento, exigindo todos os termos", () => {
    const text = contactSearchText(contact);
    expect(matchesTerms(text, searchTerms("joana sao"))).toBe(true);
    expect(matchesTerms(text, searchTerms("vip loja"))).toBe(true);
    expect(matchesTerms(text, searchTerms("joana rio"))).toBe(false);
    expect(searchTerms("   ")).toEqual([]);
  });
});
