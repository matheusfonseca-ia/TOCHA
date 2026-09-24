import { describe, expect, it } from "vitest";

import {
  parseLooseNumber,
  validateDate,
  validateEmail,
  validateInput,
  validateNumber,
  validatePhone,
  validateText,
} from "@/lib/sequences/collect";

const ok = (value: string) => ({ ok: true, value });
const bad = { ok: false };

describe("validateText", () => {
  it("aceita texto e compacta espaços", () => {
    expect(validateText("  Maria   da  Silva ")).toEqual(ok("Maria da Silva"));
  });
  it("recusa vazio", () => {
    expect(validateText("   ")).toEqual(bad);
  });
});

describe("validateEmail", () => {
  it("aceita e normaliza para minúsculas", () => {
    expect(validateEmail("Fulano.Tal@Gmail.com")).toEqual(ok("fulano.tal@gmail.com"));
  });
  it("extrai o e-mail de uma frase", () => {
    expect(validateEmail("meu email é ana+promo@empresa.com.br, valeu")).toEqual(
      ok("ana+promo@empresa.com.br")
    );
  });
  it("recusa sem domínio, sem @ ou com pontos seguidos", () => {
    expect(validateEmail("ana@gmail")).toEqual(bad);
    expect(validateEmail("ana.gmail.com")).toEqual(bad);
    expect(validateEmail("ana..silva@gmail.com")).toEqual(bad);
  });
});

describe("validatePhone", () => {
  it("celular brasileiro sem código do país ganha +55", () => {
    expect(validatePhone("(11) 98765-4321")).toEqual(ok("+5511987654321"));
    expect(validatePhone("11 3456 7890")).toEqual(ok("+551134567890"));
  });
  it("aceita com 55 na frente, com ou sem +", () => {
    expect(validatePhone("+55 11 98765-4321")).toEqual(ok("+5511987654321"));
    expect(validatePhone("5511987654321")).toEqual(ok("+5511987654321"));
  });
  it("aceita o 0 de discagem antes do DDD", () => {
    expect(validatePhone("011 98765-4321")).toEqual(ok("+5511987654321"));
  });
  it("aceita internacional com +", () => {
    expect(validatePhone("+1 (415) 555-2671")).toEqual(ok("+14155552671"));
    expect(validatePhone("+351 912 345 678")).toEqual(ok("+351912345678"));
  });
  it("tolera texto em volta", () => {
    expect(validatePhone("meu whats é 21 99999-8888")).toEqual(ok("+5521999998888"));
  });
  it("recusa curto demais, longo demais ou frase sem número", () => {
    expect(validatePhone("98765-4321")).toEqual(bad);
    expect(validatePhone("tenho 2 filhos")).toEqual(bad);
    expect(validatePhone("1234567890123456")).toEqual(bad);
  });
});

describe("validateNumber / parseLooseNumber", () => {
  it("entende formatos pt-BR e en", () => {
    expect(parseLooseNumber("1.234,56")).toBe(1234.56);
    expect(parseLooseNumber("1,234.56")).toBe(1234.56);
    expect(parseLooseNumber("1,5")).toBe(1.5);
    expect(parseLooseNumber("1.500")).toBe(1500);
    expect(parseLooseNumber("3.14")).toBe(3.14);
    expect(parseLooseNumber("-3")).toBe(-3);
  });
  it("aceita moeda e unidade em volta", () => {
    expect(validateNumber("R$ 1.500,00")).toEqual(ok("1500"));
    expect(validateNumber("30 anos")).toEqual(ok("30"));
    expect(validateNumber("42")).toEqual(ok("42"));
  });
  it("recusa frase com número solto e texto sem número", () => {
    expect(validateNumber("tenho 2 filhos")).toEqual(bad);
    expect(validateNumber("dez")).toEqual(bad);
  });
});

describe("validateDate", () => {
  it("normaliza para dd/mm/aaaa", () => {
    expect(validateDate("5/3/1990")).toEqual(ok("05/03/1990"));
    expect(validateDate("05-03-1990")).toEqual(ok("05/03/1990"));
    expect(validateDate("05.03.1990")).toEqual(ok("05/03/1990"));
    expect(validateDate("1990-03-05")).toEqual(ok("05/03/1990"));
  });
  it("ano com 2 dígitos", () => {
    expect(validateDate("05/03/90")).toEqual(ok("05/03/1990"));
    expect(validateDate("05/03/10")).toEqual(ok("05/03/2010"));
  });
  it("recusa data que não existe ou formato americano impossível", () => {
    expect(validateDate("31/02/2020")).toEqual(bad);
    expect(validateDate("12/31/2020")).toEqual(bad);
    expect(validateDate("amanhã")).toEqual(bad);
  });
  it("aceita 29/02 em ano bissexto", () => {
    expect(validateDate("29/02/2024")).toEqual(ok("29/02/2024"));
    expect(validateDate("29/02/2023")).toEqual(bad);
  });
});

describe("validateInput", () => {
  it("despacha pelo tipo", () => {
    expect(validateInput("email", "a@b.co")).toEqual(ok("a@b.co"));
    expect(validateInput("text", "oi")).toEqual(ok("oi"));
    expect(validateInput("number", "abc")).toEqual(bad);
  });
});
