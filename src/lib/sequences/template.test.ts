import { describe, expect, it } from "vitest";

import { hasTemplate, renderTemplate } from "@/lib/sequences/template";

describe("renderTemplate", () => {
  it("substitui chaves conhecidas", () => {
    expect(
      renderTemplate("Oi {{nome}}, confirmo {{email}}?", {
        nome: "Ana",
        email: "ana@x.com",
      })
    ).toBe("Oi Ana, confirmo ana@x.com?");
  });

  it("chave desconhecida vira string vazia", () => {
    expect(renderTemplate("Oi {{nome}}!", {})).toBe("Oi !");
  });

  it("não lê membros herdados de Object.prototype", () => {
    expect(renderTemplate("Oi {{constructor}}{{toString}}{{valueOf}}!", {})).toBe("Oi !");
    expect(renderTemplate("{{constructor}}", { constructor: "campo real" })).toBe("campo real");
  });

  it("tolera espaços dentro das chaves e repetição", () => {
    expect(renderTemplate("{{ nome }} e {{nome}}", { nome: "Bia" })).toBe("Bia e Bia");
  });

  it("{{username}} usa o valor passado", () => {
    expect(renderTemplate("Valeu, @{{username}}", { username: "ana.dev" })).toBe(
      "Valeu, @ana.dev"
    );
  });

  it("converte números e ignora null", () => {
    expect(renderTemplate("{{idade}} {{x}}", { idade: 30, x: null })).toBe("30 ");
  });

  it("nunca expõe estado interno (__)", () => {
    expect(renderTemplate("{{__attempts}}", { __attempts: { a: 1 } })).toBe("");
  });

  it("texto sem chaves volta igual; chaves malformadas ficam como estão", () => {
    expect(renderTemplate("sem variáveis", { a: "b" })).toBe("sem variáveis");
    expect(renderTemplate("{{ nome", { nome: "x" })).toBe("{{ nome");
    expect(hasTemplate("oi")).toBe(false);
    expect(hasTemplate("oi {{a}}")).toBe(true);
  });
});
