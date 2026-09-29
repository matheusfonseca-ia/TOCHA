import { describe, expect, it } from "vitest";

import { inboxHref } from "../utils/href";
import { leadInitials, leadName, messagePreview } from "../utils/labels";
import { dayLabel, listTime, windowStatus } from "../utils/time";

// 28/09/2026 15:00 em Brasília (18:00 UTC).
const NOW = Date.parse("2026-09-28T18:00:00Z");

describe("listTime / dayLabel (fuso de Brasília)", () => {
  it("hoje mostra a hora local, não a UTC", () => {
    expect(listTime("2026-09-28T17:05:00Z", NOW)).toBe("14:05");
    expect(dayLabel("2026-09-28T17:05:00Z", NOW)).toBe("Hoje");
  });

  it("virada de dia é a de Brasília: 01:00 UTC ainda é ontem", () => {
    expect(listTime("2026-09-28T01:00:00Z", NOW)).toBe("Ontem");
    expect(dayLabel("2026-09-28T01:00:00Z", NOW)).toBe("Ontem");
  });

  it("até 6 dias mostra o dia da semana; depois, a data", () => {
    expect(listTime("2026-09-24T15:00:00Z", NOW)).toMatch(/qui/);
    expect(listTime("2026-09-10T15:00:00Z", NOW)).toBe("10/09/26");
    expect(dayLabel("2026-09-10T15:00:00Z", NOW)).toBe("quinta-feira, 10 de setembro");
  });
});

describe("windowStatus", () => {
  it("aberta com horas restantes", () => {
    expect(windowStatus("2026-09-28T08:00:00Z", NOW)).toEqual({ open: true, label: "Janela aberta, fecha em 14h" });
  });
  it("menos de 1h", () => {
    expect(windowStatus("2026-09-27T18:30:00Z", NOW).label).toBe("Janela aberta, fecha em menos de 1h");
  });
  it("fechada: passou de 24h ou o lead nunca escreveu", () => {
    expect(windowStatus("2026-09-27T17:00:00Z", NOW).open).toBe(false);
    expect(windowStatus(null, NOW)).toEqual({ open: false, label: "Janela fechada: aguarde o lead escrever" });
  });
});

describe("rótulos", () => {
  it("prévia usa o texto; sem texto, o tipo", () => {
    expect(messagePreview("text", "  oi  ")).toBe("oi");
    expect(messagePreview("audio", null)).toBe("Áudio");
    expect(messagePreview("story_reply", "🔥")).toBe("🔥");
    expect(messagePreview("postback", "Já segui")).toBe('Tocou em "Já segui"');
  });

  it("nome e iniciais do lead", () => {
    expect(leadName("ion_comunnity", "4181139912021434")).toBe("@ion_comunnity");
    expect(leadName(null, "4181139912021434")).toBe("Lead 1434");
    expect(leadInitials("ion_comunnity")).toBe("IO");
    expect(leadInitials("_.")).toBe("IG");
    expect(leadInitials(null)).toBe("IG");
  });
});

describe("inboxHref", () => {
  it("mantém os filtros e abre a conversa", () => {
    expect(inboxHref({ accountId: "", status: "open", q: "" })).toBe("/crm/conversas");
    expect(inboxHref({ accountId: "a1", status: "unread", q: "ion" }, "c9")).toBe(
      "/crm/conversas?conta=a1&filtro=nao-lidas&q=ion&c=c9"
    );
    expect(inboxHref({ accountId: "", status: "done", q: "" })).toBe("/crm/conversas?filtro=concluidas");
  });
});
