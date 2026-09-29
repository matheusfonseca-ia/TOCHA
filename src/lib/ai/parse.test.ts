import { describe, expect, it } from "vitest";

import { parseSuggestions } from "@/lib/ai/parse";

const limits = { maxChars: 300, count: 3 };

describe("parseSuggestions", () => {
  it("lê o array JSON puro, que é o formato pedido", () => {
    const raw = '["Te chamei no direct!", "Já está na sua DM!"]';

    expect(parseSuggestions(raw, limits)).toEqual([
      "Te chamei no direct!",
      "Já está na sua DM!",
    ]);
  });

  it("lê o JSON dentro de bloco de código markdown", () => {
    const raw = '```json\n["Te chamei no direct!"]\n```';

    expect(parseSuggestions(raw, limits)).toEqual(["Te chamei no direct!"]);
  });

  it("cai pra lista numerada quando o modelo ignora o JSON", () => {
    const raw = "1. Te chamei no direct!\n2. Já está na sua DM!";

    expect(parseSuggestions(raw, limits)).toEqual([
      "Te chamei no direct!",
      "Já está na sua DM!",
    ]);
  });

  it("cai pra lista com hífen ou bullet", () => {
    const raw = "- Te chamei no direct!\n• Já está na sua DM!";

    expect(parseSuggestions(raw, limits)).toEqual([
      "Te chamei no direct!",
      "Já está na sua DM!",
    ]);
  });

  it("uma linha só, sem marcador nenhum, ainda vira uma sugestão", () => {
    expect(parseSuggestions("Te chamei no direct!", limits)).toEqual([
      "Te chamei no direct!",
    ]);
  });

  it("tira aspas que o modelo põe em volta do texto", () => {
    const raw = '1. "Te chamei no direct!"';

    expect(parseSuggestions(raw, limits)).toEqual(["Te chamei no direct!"]);
  });

  it("descarta vazias e repetidas", () => {
    const raw = '["Te chamei!", "  ", "Te chamei!", "Já está na DM!"]';

    expect(parseSuggestions(raw, limits)).toEqual([
      "Te chamei!",
      "Já está na DM!",
    ]);
  });

  it("descarta sugestão que estoura o limite do campo em vez de cortar no meio", () => {
    const longa = "x".repeat(21);
    const raw = JSON.stringify([longa, "Baixar agora"]);

    expect(parseSuggestions(raw, { maxChars: 20, count: 3 })).toEqual([
      "Baixar agora",
    ]);
  });

  it("devolve no máximo a quantidade pedida", () => {
    const raw = JSON.stringify(["um", "dois", "três", "quatro"]);

    expect(parseSuggestions(raw, { maxChars: 300, count: 2 })).toEqual([
      "um",
      "dois",
    ]);
  });

  it("resposta vazia ou só ruído devolve lista vazia", () => {
    expect(parseSuggestions("", limits)).toEqual([]);
    expect(parseSuggestions("   \n  ", limits)).toEqual([]);
  });

  it("ignora frase de preâmbulo antes da lista", () => {
    const raw = "Claro! Aqui estão as opções:\n1. Te chamei no direct!";

    expect(parseSuggestions(raw, limits)).toEqual(["Te chamei no direct!"]);
  });
});
