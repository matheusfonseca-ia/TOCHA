import { describe, expect, it } from "vitest";

import { resolveAiConfig } from "./resolve-config";

const env = { apiKey: "chave-da-instalacao", model: "env/modelo" };

describe("resolveAiConfig", () => {
  it("a chave do usuário vence a da instalação", () => {
    const result = resolveAiConfig({ apiKey: " chave-do-usuario ", model: "meu/modelo" }, env);

    expect(result).toEqual({ apiKey: "chave-do-usuario", model: "meu/modelo" });
  });

  it("usuário sem modelo próprio herda o modelo da instalação", () => {
    expect(resolveAiConfig({ apiKey: "k", model: null }, env)?.model).toBe("env/modelo");
  });

  it("usuário sem modelo e sem instalação cai no modelo padrão", () => {
    expect(resolveAiConfig({ apiKey: "k", model: null }, null)?.model).toBeTruthy();
  });

  it("sem chave do usuário usa a da instalação", () => {
    expect(resolveAiConfig(null, env)).toBe(env);
  });

  it("sem nenhuma das duas, nulo (o botão some)", () => {
    expect(resolveAiConfig(null, null)).toBeNull();
    expect(resolveAiConfig({ apiKey: "  ", model: null }, null)).toBeNull();
  });
});
