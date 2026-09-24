import { describe, expect, it } from "vitest";

import { pickBranch } from "@/lib/sequences/randomizer";

describe("pickBranch", () => {
  it("sorteia proporcional ao peso (2 caminhos 50/50)", () => {
    expect(pickBranch([50, 50], () => 0)).toBe(0);
    expect(pickBranch([50, 50], () => 0.49)).toBe(0);
    expect(pickBranch([50, 50], () => 0.51)).toBe(1);
    expect(pickBranch([50, 50], () => 0.999999)).toBe(1);
  });

  it("respeita as fronteiras entre 3 caminhos com pesos diferentes (10/20/70)", () => {
    // roll = random() * 100
    expect(pickBranch([10, 20, 70], () => 0.05)).toBe(0); // roll=5   -> [0,10)
    expect(pickBranch([10, 20, 70], () => 0.15)).toBe(1); // roll=15  -> [10,30)
    expect(pickBranch([10, 20, 70], () => 0.99)).toBe(2); // roll=99  -> [30,100)
  });

  it("pesos <= 0 nunca são sorteados", () => {
    // peso 0 no índice 0: mesmo com random()=0, cai no índice 1.
    expect(pickBranch([0, 100], () => 0)).toBe(1);
    expect(pickBranch([0, 100], () => 0.999999)).toBe(1);
  });

  it("soma <= 0 devolve o primeiro índice (grafo inválido, nunca deveria rodar)", () => {
    expect(pickBranch([0, 0], () => 0.5)).toBe(0);
    expect(pickBranch([], () => 0.5)).toBe(0);
  });

  it("usa Math.random por padrão (não lança e devolve um índice válido)", () => {
    const result = pickBranch([50, 50]);
    expect(result === 0 || result === 1).toBe(true);
  });
});
