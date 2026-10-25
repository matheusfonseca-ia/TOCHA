import { describe, expect, it } from "vitest";

import { keyHint } from "./key-hint";

describe("keyHint", () => {
  it("mostra só os 4 últimos caracteres", () => {
    expect(keyHint("sk-or-v1-abcdef1234")).toBe("••••1234");
  });

  it("ignora espaços em volta", () => {
    expect(keyHint("  sk-or-v1-abcdef1234\n")).toBe("••••1234");
  });

  it("chave curta demais não vaza nada", () => {
    expect(keyHint("abc")).toBe("••••");
  });
});
