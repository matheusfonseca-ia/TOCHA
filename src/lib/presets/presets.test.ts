import { describe, expect, it } from "vitest";

import {
  PRESET_LABEL_MAX,
  normalizePreset,
  presetsForField,
  type MessagePreset,
} from "@/lib/presets/presets";

function preset(over: Partial<MessagePreset> = {}): MessagePreset {
  return {
    id: "1",
    account_id: "conta",
    scope: "publicReply",
    label: "Padrão",
    text: "Te chamei no direct!",
    created_at: "2026-09-27T00:00:00Z",
    ...over,
  };
}

describe("normalizePreset", () => {
  it("texto vazio não vira preset", () => {
    expect(normalizePreset({ scope: "publicReply", text: "   " })).toEqual({
      error: expect.any(String),
    });
  });

  it("sem rótulo, o começo do texto vira o rótulo", () => {
    const result = normalizePreset({
      scope: "publicReply",
      text: "  Te chamei no direct!  ",
    });

    expect(result).toEqual({
      preset: { scope: "publicReply", label: "Te chamei no direct!", text: "Te chamei no direct!" },
    });
  });

  it("rótulo derivado de texto longo é cortado no limite", () => {
    const result = normalizePreset({
      scope: "replyText",
      text: "a".repeat(200),
    });

    expect("preset" in result && result.preset.label.length).toBe(
      PRESET_LABEL_MAX
    );
  });

  it("rótulo digitado pelo usuário é respeitado e aparado", () => {
    const result = normalizePreset({
      scope: "publicReply",
      text: "Te chamei!",
      label: "  Curta  ",
    });

    expect("preset" in result && result.preset.label).toBe("Curta");
  });

  it("texto maior que o maior campo do app não vira preset", () => {
    const result = normalizePreset({
      scope: "replyText",
      text: "a".repeat(1001),
    });

    expect(result).toEqual({ error: expect.any(String) });
  });
});

describe("presetsForField", () => {
  it("esconde preset que não cabe no campo", () => {
    const curto = preset({ id: "curto", text: "Baixar agora" });
    const longo = preset({ id: "longo", text: "a".repeat(50) });

    expect(presetsForField([curto, longo], "buttonLabel")).toEqual([curto]);
  });

  it("mostra primeiro os salvos no mesmo tipo de campo", () => {
    const outro = preset({ id: "outro", scope: "messageNode", text: "Oi!" });
    const mesmo = preset({ id: "mesmo", scope: "publicReply", text: "Olá!" });

    expect(
      presetsForField([outro, mesmo], "publicReply").map((p) => p.id)
    ).toEqual(["mesmo", "outro"]);
  });

  it("mantém a ordem de entrada dentro de cada grupo", () => {
    const a = preset({ id: "a", scope: "publicReply" , text: "A" });
    const b = preset({ id: "b", scope: "publicReply", text: "B" });

    expect(presetsForField([a, b], "publicReply").map((p) => p.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("lista vazia não quebra", () => {
    expect(presetsForField([], "publicReply")).toEqual([]);
  });
});
