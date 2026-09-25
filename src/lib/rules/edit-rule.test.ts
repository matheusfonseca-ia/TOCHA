import { describe, expect, it } from "vitest";

import { makeRule } from "@/lib/sequences/__tests__/fixtures";

import {
  canEditInBuilder,
  expiryFieldsForSave,
  linksFromRule,
  mergeSelectedMedia,
  preservedFields,
} from "./edit-rule";

const media = (id: string) => ({ id, media_type: "IMAGE", thumbnail_url: null, permalink: null, caption: null });

describe("edit-rule", () => {
  it("imagem como resposta não cabe nas telas completas", () => {
    expect(canEditInBuilder({ reply_type: "image" })).toBe(false);
    expect(canEditInBuilder({ reply_type: "text" })).toBe(true);
    expect(canEditInBuilder({ reply_type: "buttons" })).toBe(true);
  });

  it("botões salvos viram os slots de link do formulário", () => {
    expect(
      linksFromRule({ reply_type: "buttons", reply_buttons: [{ title: "Loja", url: "https://x.com" }] })
    ).toEqual([{ title: "Loja", url: "https://x.com", touched: true }]);
    expect(linksFromRule({ reply_type: "text", reply_buttons: null })).toEqual([]);
  });

  it("preserva nome, tipo de match, delay e estado pausado", () => {
    const rule = makeRule({ name: "Preço", match_type: "exact", delay_seconds: 5, is_active: false });
    expect(preservedFields(rule)).toEqual({
      id: rule.id,
      name: "Preço",
      match_type: "exact",
      delay_seconds: 5,
      is_active: false,
    });
  });

  it("desligar a expiração ao editar grava permanente; criando, não manda nada", () => {
    const off = { expires_at: null, expire_action: "delete" as const };
    expect(expiryFieldsForSave(off, { expires_at: "2026-10-01T00:00:00.000Z" })).toEqual({ expires_at: null });
    expect(expiryFieldsForSave(off, { expires_at: null })).toEqual({});
    expect(expiryFieldsForSave(off)).toEqual({});
    expect(
      expiryFieldsForSave({ expires_at: "2026-10-02T00:00:00.000Z", expire_action: "pause" })
    ).toEqual({ expires_at: "2026-10-02T00:00:00.000Z", expire_action: "pause" });
  });

  it("mídias já escolhidas aparecem no seletor mesmo fora das recentes, sem repetir", () => {
    const merged = mergeSelectedMedia([media("a"), media("b")], [media("old"), media("a")]);
    expect(merged.map((m) => m.id)).toEqual(["old", "a", "b"]);
  });
});
