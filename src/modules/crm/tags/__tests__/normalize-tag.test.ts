import { describe, expect, it } from "vitest";

import { cleanTagName, dedupeTagsCaseInsensitive, normalizeTag, sameTag } from "../utils/normalize-tag";

describe("normalizeTag", () => {
  it("ignora maiúsculas, acentos e espaços nas pontas", () => {
    expect(normalizeTag("  VIP  ")).toBe("vip");
    expect(normalizeTag("Ó")).toBe("o");
  });

  it("sameTag compara duas grafias da mesma tag", () => {
    expect(sameTag("VIP", "vip")).toBe(true);
    expect(sameTag("promoção", "Promocao")).toBe(true);
    expect(sameTag("vip", "cliente")).toBe(false);
  });
});

describe("cleanTagName", () => {
  it("corta espaços e respeita o limite de tamanho", () => {
    expect(cleanTagName("  vip  ")).toBe("vip");
    expect(cleanTagName("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("dedupeTagsCaseInsensitive", () => {
  it("mantém a 1ª grafia encontrada e remove as demais variantes", () => {
    expect(dedupeTagsCaseInsensitive(["VIP", "vip", "Cliente", "cliente", "Novo"])).toEqual([
      "VIP",
      "Cliente",
      "Novo",
    ]);
  });

  it("ignora entradas vazias", () => {
    expect(dedupeTagsCaseInsensitive(["  ", "vip", ""])).toEqual(["vip"]);
  });
});
