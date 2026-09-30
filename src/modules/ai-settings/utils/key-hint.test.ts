import { describe, expect, it } from "vitest";

import { isValidModelId, keyHint } from "./key-hint";

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

describe("isValidModelId", () => {
  it("aceita provedor/modelo", () => {
    expect(isValidModelId("anthropic/claude-sonnet-4.5")).toBe(true);
    expect(isValidModelId("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
  });

  it("recusa texto solto ou com espaço", () => {
    expect(isValidModelId("claude")).toBe(false);
    expect(isValidModelId("anthropic/claude sonnet")).toBe(false);
    expect(isValidModelId("")).toBe(false);
  });
});
