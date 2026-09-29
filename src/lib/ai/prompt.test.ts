import { describe, expect, it } from "vitest";

import { AI_FIELD_SPECS } from "@/lib/ai/fields";
import { buildFieldPrompt } from "@/lib/ai/prompt";

describe("buildFieldPrompt", () => {
  it("diz ao modelo quantas sugestões devolver e em que formato", () => {
    const { user } = buildFieldPrompt({ field: "publicReply", count: 3 });

    expect(user).toContain("3");
    expect(user).toContain("JSON");
  });

  it("leva o limite de caracteres do campo pro prompt", () => {
    const { user } = buildFieldPrompt({ field: "publicReply", count: 3 });

    expect(user).toContain(String(AI_FIELD_SPECS.publicReply.maxChars));
  });

  it("leva o papel do campo, que muda de campo pra campo", () => {
    const publica = buildFieldPrompt({ field: "publicReply", count: 3 }).user;
    const rotulo = buildFieldPrompt({ field: "buttonLabel", count: 3 }).user;

    expect(publica).toContain(AI_FIELD_SPECS.publicReply.role);
    expect(rotulo).toContain(AI_FIELD_SPECS.buttonLabel.role);
    expect(publica).not.toBe(rotulo);
  });

  it("inclui a instrução do usuário quando ela existe", () => {
    const { user } = buildFieldPrompt({
      field: "publicReply",
      count: 3,
      instruction: "fala de black friday",
    });

    expect(user).toContain("fala de black friday");
  });

  it("inclui o contexto da automação quando ele existe", () => {
    const { user } = buildFieldPrompt({
      field: "welcomeText",
      count: 3,
      context: { ruleName: "Aula de n8n", keyword: "AULA" },
    });

    expect(user).toContain("Aula de n8n");
    expect(user).toContain("AULA");
  });

  it("sem instrução nem contexto, não deixa rótulo órfão no prompt", () => {
    const { user } = buildFieldPrompt({ field: "publicReply", count: 3 });

    expect(user).not.toContain("Instrução");
    expect(user).not.toContain("Contexto");
  });

  it("manda o modelo escrever em português do Brasil", () => {
    const { system } = buildFieldPrompt({ field: "publicReply", count: 3 });

    expect(system.toLowerCase()).toContain("português");
  });
});
