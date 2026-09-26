import { describe, expect, it } from "vitest";

import { addVariant, allVariants, pickVariant } from "@/lib/rules/variants";

describe("allVariants", () => {
  it("coloca a primária na frente das extras", () => {
    expect(allVariants("Oi!", ["Olá!", "E aí!"])).toEqual([
      "Oi!",
      "Olá!",
      "E aí!",
    ]);
  });

  it("remove espaços nas pontas, vazios e duplicadas", () => {
    expect(allVariants(" Oi! ", ["", "  ", "Oi!", "Olá!", "Olá!"])).toEqual([
      "Oi!",
      "Olá!",
    ]);
  });

  it("primária nula/ausente: só as extras válidas", () => {
    expect(allVariants(null, ["Olá!", ""])).toEqual(["Olá!"]);
    expect(allVariants(undefined, undefined)).toEqual([]);
  });

  it("sem nenhuma variante válida devolve array vazio", () => {
    expect(allVariants("", ["", "   "])).toEqual([]);
  });
});

describe("addVariant", () => {
  it("variante 1 vazia: o texto vira a variante 1", () => {
    expect(addVariant("  ", [], "Te chamei!", 10)).toEqual({
      primary: "Te chamei!",
      extras: [],
    });
  });

  it("preenche a primeira extra em branco antes de criar outra", () => {
    expect(addVariant("Oi!", ["Olá!", " ", ""], "Te chamei!", 10)).toEqual({
      primary: "Oi!",
      extras: ["Olá!", "Te chamei!", ""],
    });
  });

  it("sem espaço em branco, entra no fim das extras", () => {
    expect(addVariant("Oi!", ["Olá!"], "Te chamei!", 10)).toEqual({
      primary: "Oi!",
      extras: ["Olá!", "Te chamei!"],
    });
  });

  it("não repete texto já cadastrado nem aceita texto vazio", () => {
    const current = { primary: "Oi!", extras: ["Te chamei!"] };
    expect(addVariant(current.primary, current.extras, " Te chamei! ", 10)).toEqual(current);
    expect(addVariant(current.primary, current.extras, "Oi!", 10)).toEqual(current);
    expect(addVariant(current.primary, current.extras, "  ", 10)).toEqual(current);
  });

  it("não passa do limite de variantes", () => {
    expect(addVariant("A", ["B", "C"], "D", 3)).toEqual({
      primary: "A",
      extras: ["B", "C"],
    });
  });
});

describe("pickVariant", () => {
  it("sem nenhuma variante devolve null", () => {
    expect(pickVariant(null, null)).toBeNull();
    expect(pickVariant("", [])).toBeNull();
  });

  it("só a primária: devolve ela sem consultar o random", () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return 0;
    };
    expect(pickVariant("Oi!", null, random)).toBe("Oi!");
    expect(calls).toBe(0);
  });

  it("sorteia entre as variantes de forma determinística com random injetado", () => {
    const variants = ["A", "B", "C"];
    expect(pickVariant(variants[0], variants.slice(1), () => 0)).toBe("A");
    expect(pickVariant(variants[0], variants.slice(1), () => 0.34)).toBe("B");
    expect(pickVariant(variants[0], variants.slice(1), () => 0.99)).toBe("C");
  });

  it("resultado do sorteio está sempre entre as variantes disponíveis", () => {
    const primary = "Primária";
    const extras = ["Extra 1", "Extra 2", "Extra 3"];
    const pool = new Set(allVariants(primary, extras));
    for (let i = 0; i < 20; i++) {
      const picked = pickVariant(primary, extras, Math.random);
      expect(picked).not.toBeNull();
      expect(pool.has(picked as string)).toBe(true);
    }
  });
});
