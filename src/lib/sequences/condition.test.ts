import { describe, expect, it } from "vitest";

import { evaluateCondition } from "@/lib/sequences/condition";

const subject = {
  fields: {
    plano: "Pró",
    cidade: "São Paulo",
    idade: "30",
    renda: "1.500,00",
    nascimento: "05/03/1990",
    vazio: "  ",
  },
  tags: ["Cliente VIP", "lead"],
};

const check = (
  operator: Parameters<typeof evaluateCondition>[0]["operator"],
  fieldKey: string,
  value = ""
) => evaluateCondition({ operator, fieldKey, value }, subject);

describe("evaluateCondition", () => {
  it("campo com nome de membro de Object.prototype não existe se o contato não tem", () => {
    expect(check("exists", "constructor")).toBe(false);
    expect(check("contains", "constructor", "function")).toBe(false);
  });

  it("equals ignora maiúsculas, acentos e espaços", () => {
    expect(check("equals", "plano", " pro ")).toBe(true);
    expect(check("equals", "plano", "basic")).toBe(false);
    expect(check("equals", "inexistente", "pro")).toBe(false);
  });

  it("contains", () => {
    expect(check("contains", "cidade", "paulo")).toBe(true);
    expect(check("contains", "cidade", "rio")).toBe(false);
    expect(check("contains", "cidade", "")).toBe(false);
  });

  it("exists considera espaço em branco como vazio", () => {
    expect(check("exists", "plano")).toBe(true);
    expect(check("exists", "vazio")).toBe(false);
    expect(check("exists", "inexistente")).toBe(false);
  });

  it("gt/lt comparam números em formato pt-BR", () => {
    expect(check("gt", "idade", "18")).toBe(true);
    expect(check("lt", "idade", "18")).toBe(false);
    expect(check("gt", "renda", "1000")).toBe(true);
    expect(check("lt", "renda", "2.000")).toBe(true);
  });

  it("gt/lt comparam datas pt-BR", () => {
    expect(check("lt", "nascimento", "01/01/2000")).toBe(true);
    expect(check("gt", "nascimento", "01/01/2000")).toBe(false);
  });

  it("gt/lt com texto não numérico é falso dos dois lados", () => {
    expect(check("gt", "cidade", "10")).toBe(false);
    expect(check("lt", "cidade", "10")).toBe(false);
    expect(check("gt", "inexistente", "10")).toBe(false);
  });

  it("hasTag ignora maiúsculas e acentos e usa o value como tag", () => {
    expect(check("hasTag", "", "cliente vip")).toBe(true);
    expect(check("hasTag", "", "LEAD")).toBe(true);
    expect(check("hasTag", "", "comprador")).toBe(false);
    expect(check("hasTag", "", "")).toBe(false);
  });
});
