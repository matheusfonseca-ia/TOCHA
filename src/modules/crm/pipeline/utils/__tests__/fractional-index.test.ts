import { describe, expect, it } from "vitest";

import {
  MIN_GAP,
  needsReindex,
  POSITION_GAP,
  positionBetween,
  reindexPositions,
  toNumber,
} from "../fractional-index";

describe("positionBetween", () => {
  it("coluna vazia: primeira posição usa o espaçamento padrão", () => {
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });

  it("início da coluna: fica antes do 1º card", () => {
    expect(positionBetween(null, 1000)).toBe(1000 - POSITION_GAP);
  });

  it("fim da coluna: fica depois do último card", () => {
    expect(positionBetween(1000, null)).toBe(1000 + POSITION_GAP);
  });

  it("entre dois cards: é a média exata", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});

describe("needsReindex", () => {
  it("sem os dois vizinhos, nunca precisa reindexar", () => {
    expect(needsReindex(null, 1000)).toBe(false);
    expect(needsReindex(1000, null)).toBe(false);
  });

  it("intervalo confortável: não precisa", () => {
    expect(needsReindex(1000, 2000)).toBe(false);
  });

  it("intervalo menor que o mínimo: precisa reindexar", () => {
    expect(needsReindex(1000, 1000 + MIN_GAP / 2)).toBe(true);
  });
});

describe("reindexPositions", () => {
  it("gera posições crescentes e igualmente espaçadas", () => {
    const positions = reindexPositions(4);
    expect(positions).toEqual([POSITION_GAP, 2 * POSITION_GAP, 3 * POSITION_GAP, 4 * POSITION_GAP]);
  });

  it("lista vazia não quebra", () => {
    expect(reindexPositions(0)).toEqual([]);
  });
});

describe("toNumber", () => {
  it("número já é número", () => {
    expect(toNumber(1000)).toBe(1000);
  });

  it("numeric do Postgres às vezes chega como string do PostgREST", () => {
    expect(toNumber("1000.5")).toBe(1000.5);
  });

  it("nulo/indefinido vira zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });
});
